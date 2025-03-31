import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import "../styles/FileUploader.css";
import "../styles/DragDropZone.css";
import DragDropZone from "./DragDropZone";

// Define valid status values using constants/object
const UploadStatus = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PAUSED: 'paused',
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
  const [selectedFiles, setSelectedFiles] = useState([]);
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
  const [pausedFiles, setPausedFiles] = useState({});
  const abortControllerRef = useRef({});
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
    
    // Only count active files (not paused) in progress calculation
    const activeFiles = files.filter(file => 
      !pausedFiles[file.name] && 
      uploadProgress[file.name] !== undefined
    );
    
    if (activeFiles.length === 0) return;
    
    const totalProgress = activeFiles.reduce((acc, file) => {
      return acc + (uploadProgress[file.name] || 0);
    }, 0);
    
    const calculatedOverallProgress = Math.round(totalProgress / activeFiles.length);
    setOverallProgress(calculatedOverallProgress);
    
    // If all files are at 100%, consider it a success
    const allCompleted = files.every(file => 
      uploadProgress[file.name] === 100 || 
      uploadProgress[file.name] === undefined
    );
    
    if (allCompleted && calculatedOverallProgress === 100) {
      setStatus(UploadStatus.SUCCESS);
    }
  }, [uploadProgress, files, pausedFiles]);

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
      setPausedFiles({});
      
      // Set the files and select all of them by default
      setFiles(validFiles);
      setSelectedFiles(validFiles.map(file => file.name));
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
    setPausedFiles({});
    
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

    // Set the files and select all of them by default
    setFiles(validFiles);
    setSelectedFiles(validFiles.map(file => file.name));
  }, [validateFile]);

  const cancelUpload = useCallback(() => {
    // Abort all ongoing uploads
    Object.values(abortControllerRef.current).forEach(controller => {
      if (controller) controller.abort();
    });
    
    // Reset abort controllers
    abortControllerRef.current = {};
    
    setStatus(UploadStatus.IDLE);
    
    // Also clear any summary polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Upload a single file with retry capability
  const uploadFile = useCallback(async (file, retryCount = 0) => {
    // Skip if file is paused
    if (pausedFiles[file.name]) {
      console.log(`Skipping upload of ${file.name} as it's paused`);
      return "paused";
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Initialize progress for this file
    setUploadProgress(prev => ({
      ...prev,
      [file.name]: 0
    }));

    // Create a new AbortController for this specific file
    abortControllerRef.current[file.name] = new AbortController();

    try {
      const response = await axios.post(API_ENDPOINT, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          // Skip progress updates if the file has been paused
          if (pausedFiles[file.name]) return;
          
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: progress
          }));
        },
        signal: abortControllerRef.current[file.name]?.signal
      });
      
      // Clean up the abort controller
      delete abortControllerRef.current[file.name];
      
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
      // Clean up the abort controller
      delete abortControllerRef.current[file.name];
      
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
  }, [pausedFiles]);

  const handleFileUpload = useCallback(async () => {
    // Filter files that are selected
    const filesToUpload = files.filter(file => selectedFiles.includes(file.name));
    
    if (filesToUpload.length === 0) {
      setErrors(prev => [...prev, "No files selected for upload"]);
      return;
    }
    
    setStatus(UploadStatus.UPLOADING);
    setErrors([]);
    
    // Store the currently uploading files
    const currentlyUploading = filesToUpload.map(file => file.name);
    
    try {
      // Upload all selected files concurrently
      const results = await Promise.allSettled(
        filesToUpload.map(file => uploadFile(file))
      );
      
      console.log("Upload results:", results);
      
      // Check if all uploads were successful (and not paused)
      const anyPaused = results.some(result => result.value === "paused");
      const allSuccessful = results.every(
        result => (result.status === 'fulfilled' && result.value === true) || result.value === "paused"
      );
      
      // Set appropriate status
      if (anyPaused) {
        setStatus(UploadStatus.PAUSED);
      } else {
        setStatus(allSuccessful ? UploadStatus.SUCCESS : UploadStatus.ERROR);
      }
    } catch (error) {
      console.error("Unexpected error during upload:", error);
      setStatus(UploadStatus.ERROR);
      setErrors(prev => [...prev, "An unexpected error occurred during upload"]);
    }
  }, [files, selectedFiles, uploadFile]);

  // Format file size to human-readable format
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // Progress bar component using CSS classes
  const ProgressBar = ({ progress, isPaused = false }) => {
    // Handle failed uploads (progress = -1)
    const progressBarClass = progress === -1 ? 'progress-bar-failed' : 
                            isPaused ? 'progress-bar-paused' :
                            progress === 100 ? 'progress-bar-success' : 'progress-bar-progress';
    
    const displayProgress = progress === -1 ? 'Failed' : 
                            isPaused ? 'Paused' : `${progress}%`;
    
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
  
  // Batch selection handlers
  const toggleFileSelection = (fileName) => {
    if (selectedFiles.includes(fileName)) {
      setSelectedFiles(prev => prev.filter(name => name !== fileName));
    } else {
      setSelectedFiles(prev => [...prev, fileName]);
    }
  };
  
  const selectAllFiles = () => {
    setSelectedFiles(files.map(file => file.name));
  };
  
  const deselectAllFiles = () => {
    setSelectedFiles([]);
  };
  
  // Pause/Resume handlers
  const togglePauseResume = (fileName) => {
    if (pausedFiles[fileName]) {
      // Resume the file
      setPausedFiles(prev => {
        const newPaused = {...prev};
        delete newPaused[fileName];
        return newPaused;
      });
      
      // Check if we need to resume upload
      if (status === UploadStatus.PAUSED || status === UploadStatus.UPLOADING) {
        // Re-upload this file
        uploadFile({name: fileName});
      }
    } else {
      // Pause the file
      setPausedFiles(prev => ({
        ...prev,
        [fileName]: true
      }));
      
      // Abort any ongoing upload for this file
      if (abortControllerRef.current[fileName]) {
        abortControllerRef.current[fileName].abort();
        delete abortControllerRef.current[fileName];
      }
      
      // If all files are now paused, update status
      const stillUploading = Object.keys(uploadProgress)
        .filter(name => uploadProgress[name] < 100 && !pausedFiles[name] && name !== fileName);
      
      if (stillUploading.length === 0 && status === UploadStatus.UPLOADING) {
        setStatus(UploadStatus.PAUSED);
      }
    }
  };
  
  const removeFile = (fileName) => {
    // Abort any ongoing upload for this file
    if (abortControllerRef.current[fileName]) {
      abortControllerRef.current[fileName].abort();
      delete abortControllerRef.current[fileName];
    }
    
    // Remove the file from states
    setFiles(prev => prev.filter(file => file.name !== fileName));
    setSelectedFiles(prev => prev.filter(name => name !== fileName));
    setPausedFiles(prev => {
      const newPaused = {...prev};
      delete newPaused[fileName];
      return newPaused;
    });
    setUploadProgress(prev => {
      const newProgress = {...prev};
      delete newProgress[fileName];
      return newProgress;
    });
  };
  
  const resumeAllUploads = () => {
    if (status !== UploadStatus.PAUSED) return;
    
    // List of files that were paused
    const pausedFilesList = Object.keys(pausedFiles);
    
    // Clear paused files
    setPausedFiles({});
    
    // Resume uploads
    setStatus(UploadStatus.UPLOADING);
    
    // Filter to only selected files that were paused
    const filesToResume = files.filter(file => 
      pausedFilesList.includes(file.name) && 
      selectedFiles.includes(file.name)
    );
    
    // Start the uploads
    filesToResume.forEach(file => {
      uploadFile(file);
    });
  };
  
  const pauseAllUploads = () => {
    if (status !== UploadStatus.UPLOADING) return;
    
    // Abort all ongoing uploads
    Object.keys(abortControllerRef.current).forEach(fileName => {
      const controller = abortControllerRef.current[fileName];
      if (controller) {
        controller.abort();
        delete abortControllerRef.current[fileName];
      }
      
      // Mark file as paused
      setPausedFiles(prev => ({
        ...prev,
        [fileName]: true
      }));
    });
    
    setStatus(UploadStatus.PAUSED);
  };
  
  const removeSelectedFiles = () => {
    // Only allow this when not uploading
    if (status === UploadStatus.UPLOADING) return;
    
    selectedFiles.forEach(fileName => removeFile(fileName));
  };
  
  return (
    <div className="file-uploader-container">
      {/* Drag & Drop Zone */}
      <DragDropZone onFilesSelected={handleFilesFromDragDrop} />
      
      {/* Classic file input as backup */}
      <input 
        type="file" 
        onChange={handleFileChange}
        multiple
        className="file-input"
      />
      
      {/* Error display */}
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
      
      {/* Batch actions */}
      {files.length > 0 && (
        <div className="batch-actions-container">
          <div className="batch-actions">
            <button 
              onClick={selectAllFiles}
              className="batch-button"
              disabled={files.length === selectedFiles.length}
            >
              Select All
            </button>
            <button 
              onClick={deselectAllFiles}
              className="batch-button"
              disabled={selectedFiles.length === 0}
            >
              Deselect All
            </button>
            {selectedFiles.length > 0 && status !== UploadStatus.UPLOADING && (
              <button 
                onClick={removeSelectedFiles}
                className="batch-button remove"
              >
                Remove Selected
              </button>
            )}
            {status === UploadStatus.UPLOADING && (
              <button 
                onClick={pauseAllUploads}
                className="batch-button pause"
              >
                Pause All
              </button>
            )}
            {status === UploadStatus.PAUSED && (
              <button 
                onClick={resumeAllUploads}
                className="batch-button resume"
              >
                Resume All
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Files list */}
      {files.length > 0 && (
        <div className="files-container">
          <p className="files-heading">Files: {files.length}, Selected: {selectedFiles.length}</p>
          {files.map(file => (
            <div 
              key={file.name} 
              className={`file-item ${selectedFiles.includes(file.name) ? 'file-item-selected' : ''}`}
              onClick={() => toggleFileSelection(file.name)}
            >
              <div className="file-item-header">
                <div className="file-selection">
                  <input 
                    type="checkbox" 
                    checked={selectedFiles.includes(file.name)}
                    onChange={() => toggleFileSelection(file.name)}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
                <div className="file-details">
                  <p className="file-name">{file.name}</p>
                  <p className="file-info">Size: {formatFileSize(file.size)}</p>
                  <p className="file-info">Type: {file.type || 'unknown'}</p>
                </div>
                <div className="file-actions">
                  {status === UploadStatus.UPLOADING && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePauseResume(file.name);
                      }}
                      className="file-action-button"
                    >
                      {pausedFiles[file.name] ? '▶️' : '⏸️'}
                    </button>
                  )}
                  {status !== UploadStatus.UPLOADING && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(file.name);
                      }}
                      className="file-action-button remove"
                    >
                      ❌
                    </button>
                  )}
                </div>
              </div>
              
              {uploadProgress[file.name] !== undefined && (
                <ProgressBar 
                  progress={uploadProgress[file.name]} 
                  isPaused={pausedFiles[file.name]}
                />
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Upload progress */}
      {files.length > 0 && (status === UploadStatus.UPLOADING || status === UploadStatus.PAUSED) && (
        <div className="overall-progress-container">
          <p className="progress-heading">
            Overall Upload Progress: 
            {status === UploadStatus.PAUSED ? ' (Paused)' : ''}
          </p>
          <ProgressBar 
            progress={overallProgress} 
            isPaused={status === UploadStatus.PAUSED}
          />
          
          <button 
            onClick={cancelUpload}
            className="cancel-button"
          >
            Cancel Upload
          </button>
        </div>
      )}
      
      {/* Upload button */}
      {files.length > 0 && selectedFiles.length > 0 && 
       status !== UploadStatus.UPLOADING && status !== UploadStatus.PAUSED && (
        <button 
          onClick={handleFileUpload}
          className="upload-button"
        >
          Upload {selectedFiles.length} {selectedFiles.length === 1 ? 'File' : 'Files'}
        </button>
      )}
      
      {/* Success message */}
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
      
      {/* File metadata */}
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
      
      {/* Summarization progress */}
      {summaryStatus === SummarizationStatus.PROCESSING && (
        <div className="summary-progress-container">
          <h3>Generating Summary...</h3>
          <ProgressBar progress={summaryProgress} />
        </div>
      )}
      
      {/* Extracted text */}
      {extractedText && (
        <div className="extracted-text-container">
          <h3>Extracted Text:</h3>
          <div className="text-content">
            {extractedText}
          </div>
        </div>
      )}
      
      {/* Summary options */}
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
      
      {/* Summary */}
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