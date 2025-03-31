import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import "../styles/FileUploader.css";
import "../styles/DragDropZone.css";
import DragDropZone from "./DragDropZone";

// Define valid status values using constants/object
const UploadStatus = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  ERROR: 'error'
};

const SummarizationStatus = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Configuration options
const MAX_FILE_SIZE_MB = 10; // Maximum file size in MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']; // Add or remove file types as needed
const API_ENDPOINT = "http://localhost:5000/upload";  // Updated to point to your Flask backend
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms

export default function FileUploader() {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState(UploadStatus.IDLE);
  const [uploadProgress, setUploadProgress] = useState({});
  const [errors, setErrors] = useState([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState([]);
  const [extractedText, setExtractedText] = useState("");
  const [fileMetadata, setFileMetadata] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryTaskId, setSummaryTaskId] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [summaryStatus, setSummaryStatus] = useState(SummarizationStatus.IDLE);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const [summaryLength, setSummaryLength] = useState(150); // Default max length
  const [showMetadata, setShowMetadata] = useState(true);
  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  
  // Clear errors after 5 seconds
  useEffect(() => {
    if (errors.length > 0) {
      const timer = setTimeout(() => {
        setErrors([]);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [errors]);

  // Calculate overall progress whenever uploadProgress changes
  useEffect(() => {
    if (files.length === 0) return;
    
    const totalProgress = Object.values(uploadProgress).reduce((acc, curr) => acc + curr, 0);
    const calculatedOverallProgress = Math.round(totalProgress / files.length);
    setOverallProgress(calculatedOverallProgress);
    
    // If all files are at 100%, consider it a success
    if (calculatedOverallProgress === 100) {
      setStatus(UploadStatus.SUCCESS);
    }
  }, [uploadProgress, files]);

  // Poll for summarization progress
  useEffect(() => {
    if (summaryTaskId && summaryStatus === SummarizationStatus.PROCESSING) {
      pollIntervalRef.current = setInterval(checkSummaryProgress, 1000);
      return () => clearInterval(pollIntervalRef.current);
    }
  }, [summaryTaskId, summaryStatus]);

  // Check the progress of the summarization task
  const checkSummaryProgress = useCallback(async () => {
    try {
      const response = await axios.get(`http://localhost:5000/progress/${summaryTaskId}`);
      const { progress, status, result, error } = response.data;
      
      setSummaryProgress(progress);
      
      if (status === 'completed') {
        setSummaryStatus(SummarizationStatus.COMPLETED);
        setSummary(result);
        clearInterval(pollIntervalRef.current);
      } else if (status === 'error') {
        setSummaryStatus(SummarizationStatus.ERROR);
        setErrors(prev => [...prev, `Summarization error: ${error}`]);
        clearInterval(pollIntervalRef.current);
      }
    } catch (error) {
      console.error("Error checking summary progress:", error);
      if (error.response && error.response.status === 404) {
        // Task not found, stop polling
        clearInterval(pollIntervalRef.current);
        setSummaryStatus(SummarizationStatus.ERROR);
        setErrors(prev => [...prev, "Summarization task not found"]);
      }
    }
  }, [summaryTaskId]);

  // Handle regenerating the summary
  const handleRegenerateSummary = async () => {
    if (!fileId) {
      setErrors(prev => [...prev, "No file available for regeneration"]);
      return;
    }
    
    try {
      setSummaryStatus(SummarizationStatus.PROCESSING);
      setSummaryProgress(0);
      setSummary("");
      
      const response = await axios.post("http://localhost:5000/regenerate", {
        file_id: fileId,
        max_length: summaryLength, // Use the current value from the slider
        min_length: Math.max(20, Math.floor(summaryLength / 3)) // Minimum length is ~1/3 of max or at least 20
      });
      
      setSummaryTaskId(response.data.task_id);
    } catch (error) {
      console.error("Error regenerating summary:", error);
      setSummaryStatus(SummarizationStatus.ERROR);
      if (error.response && error.response.data) {
        setErrors(prev => [...prev, `Error regenerating summary: ${error.response.data.error || 'Unknown error'}`]);
      } else {
        setErrors(prev => [...prev, "Error regenerating summary"]);
      }
    }
  };

  // Handle changing summary length
  const handleSummaryLengthChange = (e) => {
    setSummaryLength(parseInt(e.target.value, 10));
  };

  // Toggle metadata display
  const toggleMetadataDisplay = () => {
    setShowMetadata(!showMetadata);
  };

  // Validate file size and type
  const validateFile = useCallback((file) => {
    // Size validation
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > MAX_FILE_SIZE_MB) {
      return {
        valid: false,
        error: `File ${file.name} exceeds maximum size of ${MAX_FILE_SIZE_MB}MB`
      };
    }

    // Type validation (if ALLOWED_FILE_TYPES is not empty)
    if (ALLOWED_FILE_TYPES.length > 0 && !ALLOWED_FILE_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `File ${file.name} has unsupported type: ${file.type || 'unknown'}`
      };
    }

    return { valid: true };
  }, []);

  // This is the new handler for files from DragDropZone
  const handleFilesFromDragDrop = (validFiles, newErrors) => {
    // Add any errors to our error state
    if (newErrors && newErrors.length > 0) {
      setErrors(prev => [...prev, ...newErrors]);
    }
    
    // Process the valid files
    if (validFiles && validFiles.length > 0) {
      // Reset states since we have new files
      setStatus(UploadStatus.IDLE);
      setUploadProgress({});
      setOverallProgress(0);
      setUploadResults([]);
      setExtractedText("");
      setFileMetadata(null);
      setSummary("");
      setSummaryTaskId(null);
      setFileId(null);
      setSummaryStatus(SummarizationStatus.IDLE);
      setSummaryProgress(0);
      
      // Set the files
      setFiles(validFiles);
    }
  };

  const handleFileChange = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    if (selectedFiles.length === 0) return;
    
    // Reset states
    setStatus(UploadStatus.IDLE);
    setUploadProgress({});
    setOverallProgress(0);
    setErrors([]);
    setUploadResults([]);
    setExtractedText("");
    setFileMetadata(null);
    setSummary("");
    setSummaryTaskId(null);
    setFileId(null);
    setSummaryStatus(SummarizationStatus.IDLE);
    setSummaryProgress(0);
    
    // Validate each file
    const newErrors = [];
    const validFiles = selectedFiles.filter(file => {
      const validation = validateFile(file);
      if (!validation.valid) {
        newErrors.push(validation.error);
        return false;
      }
      return true;
    });

    if (newErrors.length > 0) {
      setErrors(newErrors);
    }

    setFiles(validFiles);
  }, [validateFile]);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus(UploadStatus.IDLE);
    
    // Also clear any summary polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Upload a single file with retry capability
  const uploadFile = useCallback(async (file, retryCount = 0) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Initialize progress for this file
    setUploadProgress(prev => ({
      ...prev,
      [file.name]: 0
    }));

    try {
      const response = await axios.post(API_ENDPOINT, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: progress
          }));
        },
        signal: abortControllerRef.current?.signal
      });
      
      // Ensure file shows 100% progress on completion
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: 100
      }));
      
      // Store the response data
      setUploadResults(prev => [...prev, {
        filename: file.name,
        response: response.data
      }]);
      
      // Store extracted text
      if (response.data.extracted_text) {
        setExtractedText(response.data.extracted_text);
      }
      
      // Store file metadata
      if (response.data.metadata) {
        setFileMetadata(response.data.metadata);
      }
      
      // Store task ID for summarization progress tracking
      if (response.data.task_id) {
        setSummaryTaskId(response.data.task_id);
        setSummaryStatus(SummarizationStatus.PROCESSING);
        setSummaryProgress(0);
      }
      
      // Store file ID for regeneration
      if (response.data.file_id) {
        setFileId(response.data.file_id);
      }
      
      return true;
    } catch (error) {
      // Don't retry if the upload was cancelled
      if (axios.isCancel(error)) {
        setErrors(prev => [...prev, `Upload of ${file.name} was cancelled`]);
        return false;
      }
      
      console.error(`Error uploading ${file.name}:`, error);
      
      // Retry logic
      if (retryCount < MAX_RETRIES) {
        setErrors(prev => [...prev, `Upload of ${file.name} failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`]);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return uploadFile(file, retryCount + 1);
      }
      
      setErrors(prev => [...prev, `Failed to upload ${file.name} after ${MAX_RETRIES} attempts`]);
      
      // Mark this file as failed in the progress
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: -1 // Using -1 to indicate failure
      }));
      
      return false;
    }
  }, []);

  const handleFileUpload = useCallback(async () => {
    if (files.length === 0) return;
    
    setStatus(UploadStatus.UPLOADING);
    setErrors([]);
    setUploadResults([]);
    setExtractedText("");
    setFileMetadata(null);
    setSummary("");
    setSummaryTaskId(null);
    setFileId(null);
    setSummaryStatus(SummarizationStatus.IDLE);
    setSummaryProgress(0);
    
    // Create a new AbortController for this upload batch
    abortControllerRef.current = new AbortController();
    
    try {
      // Upload all files concurrently
      const results = await Promise.allSettled(
        files.map(file => uploadFile(file))
      );
      
      // Check if all uploads were successful
      const allSuccessful = results.every(
        result => result.status === 'fulfilled' && result.value === true
      );
      
      setStatus(allSuccessful ? UploadStatus.SUCCESS : UploadStatus.ERROR);
    } catch (error) {
      console.error("Unexpected error during upload:", error);
      setStatus(UploadStatus.ERROR);
      setErrors(prev => [...prev, "An unexpected error occurred during upload"]);
    } finally {
      abortControllerRef.current = null;
    }
  }, [files, uploadFile]);

  // Format file size to human-readable format
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // Progress bar component using CSS classes
  const ProgressBar = ({ progress, type = "success" }) => {
    // Handle failed uploads (progress = -1)
    const progressBarClass = progress === -1 ? 'progress-bar-failed' : 
                            type === "summary" ? 'progress-bar-summary' : 'progress-bar-success';
    const displayProgress = progress === -1 ? 'Failed' : `${progress}%`;
    
    return (
      <div className="progress-container">
        <div 
          className={`progress-bar ${progressBarClass}`}
          style={{ width: progress === -1 ? '100%' : `${progress}%` }}
        >
          {displayProgress}
        </div>
      </div>
    );
  };

  // Render metadata in a user-friendly way
  const renderMetadata = (metadata) => {
    if (!metadata) return null;

    // Function to determine if a value should be excluded from display
    const shouldExclude = (key, value) => {
      // Exclude nested objects (like exif data) and error messages
      return (
        typeof value === 'object' ||
        key.includes('error') ||
        key === 'file_path' // Hide file path for security reasons
      );
    };

    // Group metadata into categories
    const basicInfo = {};
    const documentInfo = {};
    const mediaInfo = {};
    const technicalInfo = {};

    // Sort keys and group them
    Object.keys(metadata).sort().forEach(key => {
      const value = metadata[key];
      
      if (shouldExclude(key, value)) return;
      
      // Basic info category
      if (['filename', 'extension', 'type', 'size_formatted', 'created_time', 'modified_time'].includes(key)) {
        basicInfo[key] = value;
      }
      // Document info category
      else if (['title', 'author', 'subject', 'creation_date', 'modification_date', 'word_count', 'line_count', 'paragraph_count'].includes(key)) {
        documentInfo[key] = value;
      }
      // Media info category
      else if (['width', 'height', 'resolution', 'camera_make', 'camera_model', 'exposure_time', 'f_number', 'iso_speed'].includes(key)) {
        mediaInfo[key] = value;
      }
      // Everything else goes to technical info
      else {
        technicalInfo[key] = value;
      }
    });

    // Format a metadata group
    const formatMetadataGroup = (group, title) => {
      const keys = Object.keys(group);
      if (keys.length === 0) return null;
      
      return (
        <div className="metadata-group">
          <h4>{title}</h4>
          <table className="metadata-table">
            <tbody>
              {keys.map(key => (
                <tr key={key}>
                  <td className="metadata-key">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                  <td className="metadata-value">{group[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div className="file-metadata">
        {formatMetadataGroup(basicInfo, "Basic Information")}
        {formatMetadataGroup(documentInfo, "Document Information")}
        {formatMetadataGroup(mediaInfo, "Media Information")}
        {formatMetadataGroup(technicalInfo, "Technical Information")}
      </div>
    );
  };
  
  return (
    <div className="file-uploader-container">
      {/* New Drag & Drop Zone */}
      <DragDropZone onFilesSelected={handleFilesFromDragDrop} />
      
      {/* Classic file input as backup */}
      <input 
        type="file" 
        onChange={handleFileChange}
        multiple
        className="file-input"
      />
      
      {errors.length > 0 && (
        <div className="error-container">
          <p className="error-heading">Errors:</p>
          <ul className="error-list">
            {errors.map((error, index) => (
              <li key={index} className="error-item">{error}</li>
            ))}
          </ul>
        </div>
      )}
      
      {files.length > 0 && (
        <div className="files-container">
          <p className="files-heading">Files to upload: {files.length}</p>
          {files.map(file => (
            <div key={file.name} className="file-item">
              <p className="file-name">{file.name}</p>
              <p className="file-info">Size: {formatFileSize(file.size)}</p>
              <p className="file-info">Type: {file.type || 'unknown'}</p>
              
              {uploadProgress[file.name] !== undefined && (
                <ProgressBar progress={uploadProgress[file.name]} />
              )}
            </div>
          ))}
        </div>
      )}
      
      {files.length > 0 && status === UploadStatus.UPLOADING && (
        <div className="overall-progress-container">
          <p className="progress-heading">Overall Upload Progress:</p>
          <ProgressBar progress={overallProgress} />
          
          <button 
            onClick={cancelUpload}
            className="cancel-button"
          >
            Cancel Upload
          </button>
        </div>
      )}
      
      {files.length > 0 && status !== UploadStatus.UPLOADING && (
        <button 
          onClick={handleFileUpload}
          className="upload-button"
        >
          Upload {files.length} {files.length === 1 ? 'File' : 'Files'}
        </button>
      )}
      
      {status === UploadStatus.SUCCESS && (
        <div className="success-container">
          <p className="success-message">
            All files uploaded successfully
          </p>
          
          {uploadResults.length > 0 && (
            <div className="upload-results">
              <h3>Upload Results:</h3>
              <ul>
                {uploadResults.map((result, index) => (
                  <li key={index}>
                    <strong>{result.filename}</strong>: Saved to server
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {fileMetadata && (
        <div className="metadata-container">
          <div className="metadata-header">
            <h3>File Metadata</h3>
            <button 
              className="toggle-button"
              onClick={toggleMetadataDisplay}
            >
              {showMetadata ? 'Hide Metadata' : 'Show Metadata'}
            </button>
          </div>
          {showMetadata && renderMetadata(fileMetadata)}
        </div>
      )}
      
      {summaryStatus === SummarizationStatus.PROCESSING && (
        <div className="summary-progress-container">
          <h3>Generating Summary...</h3>
          <ProgressBar progress={summaryProgress} type="summary" />
        </div>
      )}
      
      {extractedText && (
        <div className="extracted-text-container">
          <h3>Extracted Text:</h3>
          <div className="text-content">
            {extractedText}
          </div>
        </div>
      )}
      
      {summaryStatus === SummarizationStatus.COMPLETED && (
        <div className="summary-options-container">
          <div className="summary-length-slider">
            <label htmlFor="summary-length">Summary Length: {summaryLength} words</label>
            <input 
              type="range" 
              id="summary-length" 
              min="50" 
              max="300" 
              step="10" 
              value={summaryLength} 
              onChange={handleSummaryLengthChange}
            />
          </div>
          <button 
            className="regenerate-button"
            onClick={handleRegenerateSummary}
            disabled={summaryStatus === SummarizationStatus.PROCESSING}
          >
            Regenerate Summary
          </button>
        </div>
      )}
      
      {summary && (
        <div className="summary-container">
          <h3>Summary:</h3>
          <div className="summary-text">
            {summary}
          </div>
        </div>
      )}
    
    </div>
  );
}