from flask import Flask, request, jsonify
from flask_cors import CORS
from pypdf import PdfReader
import docx
from PIL import Image
import pytesseract
import os
from transformers import pipeline
import uuid
import threading
import time

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Create uploads directory if it doesn't exist
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Dictionary to store progress for each task
summarization_progress = {}

# Dictionary to store extracted text for each file
extracted_texts = {}

# Initialize the summarization pipeline
# Note: This will download the model on first run which may take some time
summarizer = pipeline("summarization", model="facebook/bart-large-cnn")

# File upload endpoint
@app.route("/upload", methods=["POST"])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    # Save the file to the uploads directory
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(file_path)
    
    # Extract text from the file
    extracted_text = extract_text(file_path)
    
    # Store the extracted text for later regeneration
    file_id = str(uuid.uuid4())
    extracted_texts[file_id] = extracted_text
    
    # Create a task ID for tracking progress
    task_id = str(uuid.uuid4())
    summarization_progress[task_id] = {
        "progress": 0,
        "status": "processing",
        "result": None,
        "error": None
    }
    
    # Start summarization in a background thread
    thread = threading.Thread(
        target=process_summary_task,
        args=(task_id, extracted_text)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "message": "File processed successfully",
        "filename": file.filename,
        "path": file_path,
        "extracted_text": extracted_text,
        "task_id": task_id,
        "file_id": file_id
    })

# Regenerate summary endpoint
@app.route("/regenerate", methods=["POST"])
def regenerate_summary():
    data = request.json
    if not data or "file_id" not in data:
        return jsonify({"error": "Missing file_id parameter"}), 400
    
    file_id = data["file_id"]
    
    # Check if we have the extracted text
    if file_id not in extracted_texts:
        return jsonify({"error": "File not found. Please upload the file again."}), 404
    
    # Get the stored extracted text
    extracted_text = extracted_texts[file_id]
    
    # Optional parameters for customization
    max_length = data.get("max_length", 150)
    min_length = data.get("min_length", 40)
    
    # Create a new task ID for tracking progress
    task_id = str(uuid.uuid4())
    summarization_progress[task_id] = {
        "progress": 0,
        "status": "processing",
        "result": None,
        "error": None
    }
    
    # Start summarization in a background thread
    thread = threading.Thread(
        target=process_summary_task,
        args=(task_id, extracted_text, max_length, min_length)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "message": "Regenerating summary",
        "task_id": task_id
    })

# Endpoint to check progress
@app.route("/progress/<task_id>", methods=["GET"])
def check_progress(task_id):
    if task_id not in summarization_progress:
        return jsonify({"error": "Task not found"}), 404
    
    task_info = summarization_progress[task_id]
    response = {
        "progress": task_info["progress"],
        "status": task_info["status"]
    }
    
    if task_info["status"] == "completed":
        response["result"] = task_info["result"]
    elif task_info["status"] == "error":
        response["error"] = task_info["error"]
    
    # Clean up completed tasks after a while
    if task_info["status"] in ["completed", "error"] and task_info.get("cleanup_time", 0) == 0:
        task_info["cleanup_time"] = time.time() + 3600  # Cleanup after 1 hour
    
    return jsonify(response)

def process_summary_task(task_id, text, max_length=150, min_length=40):
    try:
        summary = summarize_text(text, task_id, max_length, min_length)
        summarization_progress[task_id]["result"] = summary
        summarization_progress[task_id]["status"] = "completed"
        summarization_progress[task_id]["progress"] = 100
    except Exception as e:
        summarization_progress[task_id]["error"] = str(e)
        summarization_progress[task_id]["status"] = "error"
        print(f"Error during summarization: {e}")

def extract_text(file_path):
    """Extract text based on file type"""
    file_extension = os.path.splitext(file_path)[1].lower()
    
    if file_extension == '.pdf':
        return extract_from_pdf(file_path)
    elif file_extension == '.docx':
        return extract_from_docx(file_path)
    elif file_extension in ['.jpg', '.jpeg', '.png']:
        try:
            return extract_from_image(file_path)
        except Exception as e:
            print(f"Error extracting text from image: {e}")
            return f"Error extracting text from image: {str(e)}"
    elif file_extension in ['.txt']:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except UnicodeDecodeError:
            # Try different encoding if UTF-8 fails
            with open(file_path, 'r', encoding='latin-1') as f:
                return f.read()
    else:
        return "Unsupported file format"

def extract_from_pdf(file_path):
    try:
        text = ""
        with open(file_path, 'rb') as file:
            reader = PdfReader(file)
            
            # Check if PDF is encrypted
            if reader.is_encrypted:
                try:
                    reader.decrypt('')  # Try empty password
                except:
                    return "Error: PDF is encrypted and could not be decrypted"
            
            # Check if PDF has pages
            if len(reader.pages) == 0:
                return "Error: PDF has no pages"
                
            # Extract text from each page
            for page_num in range(len(reader.pages)):
                page_text = reader.pages[page_num].extract_text()
                if page_text:
                    text += page_text + "\n"
                else:
                    text += f"[Page {page_num+1} contains no extractable text]\n"
        
        # If no text was extracted, it might be an image-based PDF
        if not text.strip():
            # For image-based PDFs, we need PyMuPDF
            try:
                import fitz  # PyMuPDF
                import tempfile
                
                print("No text found in PDF, attempting OCR...")
                doc = fitz.open(file_path)
                text = ""
                
                for page_num in range(len(doc)):
                    page = doc.load_page(page_num)
                    pix = page.get_pixmap()
                    
                    # Save image to a temporary file
                    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp:
                        temp_filename = temp.name
                        pix.save(temp_filename)
                    
                    # Use Tesseract OCR on the image
                    image_text = pytesseract.image_to_string(Image.open(temp_filename))
                    text += image_text + "\n"
                    
                    # Clean up temp file
                    os.unlink(temp_filename)
                
                if not text.strip():
                    return "Error: No text could be extracted from this PDF, even with OCR."
            except ImportError:
                return "Error: PyMuPDF (fitz) is not installed. Please run 'pip install pymupdf' to process image-based PDFs."
            except Exception as e:
                return f"Error during OCR process: {str(e)}"
        
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return f"Error extracting text from PDF: {str(e)}"

def extract_from_docx(file_path):
    try:
        doc = docx.Document(file_path)
        return "\n".join([paragraph.text for paragraph in doc.paragraphs])
    except Exception as e:
        print(f"Error extracting text from DOCX: {e}")
        return f"Error extracting text from DOCX: {str(e)}"

def extract_from_image(file_path):
    try:
        image = Image.open(file_path)
        
        # For Windows - update this path to where you installed Tesseract
        # Comment this line out if you're on macOS/Linux and Tesseract is in your PATH
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        
        text = pytesseract.image_to_string(image)
        
        if not text.strip():
            return "Error: No text could be extracted from this image."
        
        return text
    except Exception as e:
        print(f"Error extracting text from image: {e}")
        return f"Error extracting text from image: {str(e)}"

def summarize_text(text, task_id=None, max_length=150, min_length=40):
    """Summarize the given text using the BART model"""
    # Handle empty or very short text
    if not text or len(text) < 100:
        return "Text too short for meaningful summarization."
    
    # Check if the text is an error message
    if text.startswith("Error"):
        return "Cannot summarize due to text extraction error."
    
    try:
        # Handle longer texts by chunking if needed
        if len(text) > 1024:
            chunks = [text[i:i+1024] for i in range(0, len(text), 1024)]
            summaries = []
            
            for i, chunk in enumerate(chunks):
                # Update progress
                if task_id:
                    progress = int((i / len(chunks)) * 100)
                    summarization_progress[task_id]["progress"] = progress
                
                summary = summarizer(chunk, max_length=max_length//len(chunks), 
                                   min_length=min_length//len(chunks))
                summaries.append(summary[0]['summary_text'])
            
            return " ".join(summaries)
        else:
            # Update progress to 50% to show that processing has started
            if task_id:
                summarization_progress[task_id]["progress"] = 50
            
            summary = summarizer(text, max_length=max_length, min_length=min_length)
            
            return summary[0]['summary_text']
    except Exception as e:
        print(f"Error during summarization: {e}")
        raise e

# Cleanup function to periodically remove old tasks
def cleanup_old_tasks():
    current_time = time.time()
    to_remove = []
    
    for task_id, task_info in summarization_progress.items():
        cleanup_time = task_info.get("cleanup_time", 0)
        if cleanup_time > 0 and current_time > cleanup_time:
            to_remove.append(task_id)
    
    for task_id in to_remove:
        del summarization_progress[task_id]

# Start a background thread for cleanup
def start_cleanup_thread():
    def cleanup_loop():
        while True:
            cleanup_old_tasks()
            time.sleep(3600)  # Check every hour
    
    thread = threading.Thread(target=cleanup_loop)
    thread.daemon = True
    thread.start()

# Start the cleanup thread when the app starts
start_cleanup_thread()

if __name__ == "__main__":
    app.run(debug=True)