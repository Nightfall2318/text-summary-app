import React, { useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { FileUploaderProvider, useFileUploader, ACTIONS, UploadStatus, SummarizationStatus } from "./FileUploaderContext";
import DragDropZone from "./DragDropZone";
import "../styles/FileUploader.css";
import "../styles/DragDropZone.css";
import FileItem from './FileItem';

// Configuration options
const API_ENDPOINT = "http://localhost:5000/upload";
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms

// FileUploaderContent - the main component that uses the context
const FileUploaderContent = () => {
  const { state, dispatch } = useFileUploader();
  const {
    files,
    selectedFiles,
    status,
    uploadProgress,
    pausedFiles,
    errors,
    overallProgress,
    uploadResults,
    extractedText,
    fileMetadata,
    summary,
    summaryTaskId,
    fileId,
    summaryStatus,
    summaryProgress,
    summaryLength,
    showMetadata
  } = state;
  
  const abortControllerRef = useRef({});
  const pollIntervalRef = useRef(null);
  
  // Clear errors after 5 seconds
  useEffect(() => {
    if (errors && errors.length > 0) {
      const timer = setTimeout(() => {
        dispatch({ type: ACTIONS.CLEAR_ERRORS });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [errors, dispatch]);

  // Calculate overall progress whenever uploadProgress changes
  useEffect(() => {
    if (!files || files.length === 0) return;
    
    // Only count active files (not paused) in progress calculation
    const activeFiles = files.filter(file => 
      file &&
      file.name && 
      !pausedFiles[file.name] && 
      uploadProgress[file.name] !== undefined
    );
    
    if (activeFiles.length === 0) return;
    
    const totalProgress = activeFiles.reduce((acc, file) => {
      return acc + (uploadProgress[file.name] || 0);
    }, 0);
    
    const calculatedOverallProgress = Math.round(totalProgress / activeFiles.length);
    dispatch({ type: ACTIONS.SET_OVERALL_PROGRESS, payload: calculatedOverallProgress });
    
    // If all files are at 100%, consider it a success
    const allCompleted = files.every(file => 
      !file ||
      !file.name ||
      uploadProgress[file.name] === 100 || 
      uploadProgress[file.name] === undefined
    );
    
    if (allCompleted && calculatedOverallProgress === 100) {
      dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.SUCCESS });
    }
  }, [uploadProgress, files, pausedFiles, dispatch]);

  // Poll for summarization progress
  useEffect(() => {
    if (summaryTaskId && summaryStatus === SummarizationStatus.PROCESSING) {
      pollIntervalRef.current = setInterval(checkSummaryProgress, 1000);
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [summaryTaskId, summaryStatus]);

  const onFilesSelected = (files, errors) => {
    if (errors && errors.length > 0) {
      errors.forEach(error => {
        dispatch({ type: ACTIONS.SET_ERRORS, payload: error });
      });
    }
    
    if (files && files.length > 0) {
      dispatch({ type: ACTIONS.SET_FILES, payload: files });
    }
  };

  // Check the progress of the summarization task
  const checkSummaryProgress = useCallback(async () => {
    if (!summaryTaskId) return;
    
    try {
      console.log("Checking summary progress for task:", summaryTaskId);
      const response = await axios.get(`http://localhost:5000/progress/${summaryTaskId}`);
      console.log("Progress response:", response.data);
      
      const { progress, status, result, error } = response.data;
      
      dispatch({ type: ACTIONS.SET_SUMMARY_PROGRESS, payload: progress });
      
      if (status === 'completed') {
        dispatch({ type: ACTIONS.SET_SUMMARY_STATUS, payload: SummarizationStatus.COMPLETED });
        dispatch({ type: ACTIONS.SET_SUMMARY, payload: result });
        
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else if (status === 'error') {
        dispatch({ type: ACTIONS.SET_SUMMARY_STATUS, payload: SummarizationStatus.ERROR });
        dispatch({ type: ACTIONS.SET_ERRORS, payload: `Summarization error: ${error}` });
        
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error("Error checking summary progress:", error);
      if (error.response && error.response.status === 404) {
        // Task not found, stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        
        dispatch({ type: ACTIONS.SET_SUMMARY_STATUS, payload: SummarizationStatus.ERROR });
        dispatch({ type: ACTIONS.SET_ERRORS, payload: "Summarization task not found" });
      }
    }
  }, [summaryTaskId, dispatch]);

  // Handle regenerating the summary
  const handleRegenerateSummary = async () => {
    if (!fileId) {
      dispatch({ type: ACTIONS.SET_ERRORS, payload: "No file available for regeneration" });
      return;
    }
    
    try {
      dispatch({ type: ACTIONS.SET_SUMMARY_STATUS, payload: SummarizationStatus.PROCESSING });
      dispatch({ type: ACTIONS.SET_SUMMARY_PROGRESS, payload: 0 });
      dispatch({ type: ACTIONS.SET_SUMMARY, payload: "" });
      
      const response = await axios.post("http://localhost:5000/regenerate", {
        file_id: fileId,
        max_length: summaryLength, // Use the current value from the slider
        min_length: Math.max(20, Math.floor(summaryLength / 3)) // Minimum length is ~1/3 of max or at least 20
      });
      
      dispatch({ type: ACTIONS.SET_SUMMARY_TASK_ID, payload: response.data.task_id });
    } catch (error) {
      console.error("Error regenerating summary:", error);
      dispatch({ type: ACTIONS.SET_SUMMARY_STATUS, payload: SummarizationStatus.ERROR });
      if (error.response && error.response.data) {
        dispatch({ 
          type: ACTIONS.SET_ERRORS, 
          payload: `Error regenerating summary: ${error.response.data.error || 'Unknown error'}`
        });
      } else {
        dispatch({ type: ACTIONS.SET_ERRORS, payload: "Error regenerating summary" });
      }
    }
  };

  // Handle changing summary length
  const handleSummaryLengthChange = (e) => {
    dispatch({ 
      type: ACTIONS.SET_SUMMARY_LENGTH, 
      payload: parseInt(e.target.value, 10)
    });
  };

  // Toggle metadata display
  const toggleMetadataDisplay = () => {
    dispatch({ type: ACTIONS.TOGGLE_METADATA_DISPLAY });
  };

  const cancelUpload = useCallback(() => {
    // Abort all ongoing uploads
    Object.values(abortControllerRef.current).forEach(controller => {
      if (controller) controller.abort();
    });
    
    // Reset abort controllers
    abortControllerRef.current = {};
    
    dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.IDLE });
    
    // Also clear any summary polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [dispatch]);

  // Upload a single file with retry capability
  const uploadFile = useCallback(async (file, retryCount = 0) => {
    // Enhanced validation to prevent "Invalid file object" errors
    if (!file || !file.name || !file.size || typeof file.size !== 'number') {
      console.error("Invalid file object provided to uploadFile:", file);
      dispatch({ type: ACTIONS.SET_ERRORS, payload: "Invalid file object detected" });
      return false;
    }
    
    // Skip if file is paused
    if (pausedFiles && pausedFiles[file.name]) {
      console.log(`Skipping upload of ${file.name} as it's paused`);
      return "paused";
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Initialize progress for this file
    dispatch({ 
      type: ACTIONS.SET_UPLOAD_PROGRESS, 
      payload: { fileName: file.name, progress: 0 } 
    });

    // Create a new AbortController for this specific file
    abortControllerRef.current[file.name] = new AbortController();

    try {
      console.log("Uploading file:", file.name);
      const response = await axios.post(API_ENDPOINT, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          // Skip progress updates if the file has been paused
          if (pausedFiles && pausedFiles[file.name]) return;
          
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          
          dispatch({ 
            type: ACTIONS.SET_UPLOAD_PROGRESS, 
            payload: { fileName: file.name, progress }
          });
        },
        signal: abortControllerRef.current[file.name]?.signal
      });
      
      console.log("Upload response:", response.data);
      
      // Clean up the abort controller
      delete abortControllerRef.current[file.name];
      
      // Ensure file shows 100% progress on completion
      dispatch({ 
        type: ACTIONS.SET_UPLOAD_PROGRESS, 
        payload: { fileName: file.name, progress: 100 } 
      });
      
      // Store the response data
      dispatch({ 
        type: ACTIONS.SET_UPLOAD_RESULTS, 
        payload: {
          filename: file.name,
          response: response.data
        }
      });
      
      // Store extracted text
      if (response.data.extracted_text) {
        dispatch({ type: ACTIONS.SET_EXTRACTED_TEXT, payload: response.data.extracted_text });
      }
      
      // Store file metadata
      if (response.data.metadata) {
        dispatch({ type: ACTIONS.SET_FILE_METADATA, payload: response.data.metadata });
      }
      
      // Store task ID for summarization progress tracking
      if (response.data.task_id) {
        console.log("Received task ID:", response.data.task_id);
        dispatch({ type: ACTIONS.SET_SUMMARY_TASK_ID, payload: response.data.task_id });
        dispatch({ type: ACTIONS.SET_SUMMARY_STATUS, payload: SummarizationStatus.PROCESSING });
        dispatch({ type: ACTIONS.SET_SUMMARY_PROGRESS, payload: 0 });
        
        // Start checking progress immediately
        setTimeout(() => checkSummaryProgress(), 500);
      }
      
      // Store file ID for regeneration
      if (response.data.file_id) {
        dispatch({ type: ACTIONS.SET_FILE_ID, payload: response.data.file_id });
      }
      
      return true;
    } catch (error) {
      // Clean up the abort controller
      delete abortControllerRef.current[file.name];
      
      // Don't retry if the upload was cancelled
      if (axios.isCancel(error)) {
        dispatch({ type: ACTIONS.SET_ERRORS, payload: `Upload of ${file.name} was cancelled` });
        return false;
      }
      
      console.error(`Error uploading ${file.name}:`, error);
      
      // Retry logic
      if (retryCount < MAX_RETRIES) {
        dispatch({ type: ACTIONS.SET_ERRORS, payload: `Upload of ${file.name} failed, retrying... (${retryCount + 1}/${MAX_RETRIES})` });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return uploadFile(file, retryCount + 1);
      }
      
      dispatch({ type: ACTIONS.SET_ERRORS, payload: `Failed to upload ${file.name} after ${MAX_RETRIES} attempts` });
      
      // Mark this file as failed in the progress
      dispatch({ 
        type: ACTIONS.SET_UPLOAD_PROGRESS, 
        payload: { fileName: file.name, progress: -1 } 
      });
      
      return false;
    }
  }, [pausedFiles, dispatch, checkSummaryProgress]);

  const handleFileUpload = useCallback(async () => {
    // Filter files that are selected
    const filesToUpload = files.filter(file => 
      file && file.name && file.size && selectedFiles.includes(file.name)
    );
    
    if (filesToUpload.length === 0) {
      dispatch({ type: ACTIONS.SET_ERRORS, payload: "No files selected for upload" });
      return;
    }
    
    dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.UPLOADING });
    dispatch({ type: ACTIONS.CLEAR_ERRORS });
    
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
        dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.PAUSED });
      } else {
        dispatch({ type: ACTIONS.SET_STATUS, payload: allSuccessful ? UploadStatus.SUCCESS : UploadStatus.ERROR });
      }
    } catch (error) {
      console.error("Unexpected error during upload:", error);
      dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.ERROR });
      dispatch({ type: ACTIONS.SET_ERRORS, payload: "An unexpected error occurred during upload" });
    }
  }, [files, selectedFiles, uploadFile, dispatch]);

  // Format file size to human-readable format
  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // Progress bar component using CSS classes
  const ProgressBar = ({ progress, isPaused = false, type = "default" }) => {
    // Determine the right class
    let progressBarClass;
    if (progress === -1) {
      progressBarClass = 'progress-bar-failed';
    } else if (isPaused) {
      progressBarClass = 'progress-bar-paused';
    } else if (type === "summary") {
      progressBarClass = 'progress-bar-summary';
    } else if (progress === 100) {
      progressBarClass = 'progress-bar-success';
    } else {
      progressBarClass = 'progress-bar-progress';
    }
    
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
      dispatch({ type: ACTIONS.DESELECT_FILE, payload: fileName });
    } else {
      dispatch({ type: ACTIONS.SELECT_FILE, payload: fileName });
    }
  };
  
  const selectAllFiles = () => {
    dispatch({ type: ACTIONS.SELECT_ALL_FILES });
  };
  
  const deselectAllFiles = () => {
    dispatch({ type: ACTIONS.DESELECT_ALL_FILES });
  };
  
  // Pause/Resume handlers
  const togglePauseResume = (fileName) => {
    if (pausedFiles && pausedFiles[fileName]) {
      // Resume the file
      dispatch({ type: ACTIONS.RESUME_FILE, payload: fileName });
      
      // Check if we need to resume upload
      if (status === UploadStatus.PAUSED || status === UploadStatus.UPLOADING) {
        // Find the original file object to re-upload
        const fileToUpload = files.find(file => 
          file && file.name === fileName && file.size && typeof file.size === 'number'
        );
        
        if (fileToUpload) {
          uploadFile(fileToUpload);
        } else {
          dispatch({ type: ACTIONS.SET_ERRORS, payload: `Unable to resume ${fileName}: file reference lost` });
        }
      }
    } else {
      // Pause the file
      dispatch({ type: ACTIONS.PAUSE_FILE, payload: fileName });
      
      // Abort any ongoing upload for this file
      if (abortControllerRef.current[fileName]) {
        abortControllerRef.current[fileName].abort();
        delete abortControllerRef.current[fileName];
      }
      
      // If all files are now paused, update status
      const stillUploading = files.filter(file => 
        file && file.name && 
        uploadProgress[file.name] !== undefined && 
        uploadProgress[file.name] < 100 && 
        (!pausedFiles || !pausedFiles[file.name]) && 
        file.name !== fileName
      );
      
      if (stillUploading.length === 0 && status === UploadStatus.UPLOADING) {
        dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.PAUSED });
      }
    }
  };
  
  const removeFile = (fileName) => {
    // Abort any ongoing upload for this file
    if (abortControllerRef.current[fileName]) {
      abortControllerRef.current[fileName].abort();
      delete abortControllerRef.current[fileName];
    }
    
    // Remove the file
    dispatch({ type: ACTIONS.REMOVE_FILE, payload: fileName });
  };
  
  const resumeAllUploads = () => {
    if (status !== UploadStatus.PAUSED) return;
    
    // List of files that were paused
    const pausedFilesList = pausedFiles ? Object.keys(pausedFiles) : [];
    if (pausedFilesList.length === 0) return;
    
    // Resume uploads
    dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.UPLOADING });
    
    // Filter to only selected files that were paused
    const filesToResume = files.filter(file => 
      file && file.name && file.size && typeof file.size === 'number' &&
      pausedFilesList.includes(file.name) && 
      selectedFiles.includes(file.name)
    );
    
    if (filesToResume.length === 0) {
      dispatch({ type: ACTIONS.SET_ERRORS, payload: "No valid files to resume" });
      return;
    }
    
    // Clear paused files one by one
    pausedFilesList.forEach(fileName => {
      dispatch({ type: ACTIONS.RESUME_FILE, payload: fileName });
    });
    
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
      dispatch({ type: ACTIONS.PAUSE_FILE, payload: fileName });
    });
    
    dispatch({ type: ACTIONS.SET_STATUS, payload: UploadStatus.PAUSED });
  };
  
  const removeSelectedFiles = () => {
    // Only allow this when not uploading
    if (status === UploadStatus.UPLOADING) return;
    
    selectedFiles.forEach(fileName => removeFile(fileName));
  };
  
  return (
    <div className="file-uploader-container">
      {/* Drag & Drop Zone */}

      <DragDropZone onFilesSelected={onFilesSelected} />
      
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
      
      {files.length > 0 && (
      <div className="files-container">
        <p className="files-heading">
          Files: {files.length}
          {selectedFiles.length > 0 && 
            <span className="selected-count"> • {selectedFiles.length} selected</span>
          }
        </p>
        {files.map(file => (
          <FileItem
            key={file.name}
            file={file}
            isSelected={selectedFiles.includes(file.name)}
            isPaused={pausedFiles && pausedFiles[file.name]}
            progress={uploadProgress[file.name]}
            onSelect={toggleFileSelection}
            onRemove={removeFile}
            onTogglePause={togglePauseResume}
            isUploading={status === UploadStatus.UPLOADING}
          />
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
      
      {/* Extracted text */}
      {extractedText && (
        <div className="extracted-text-container">
          <h3>Extracted Text:</h3>
          <div className="text-content">
            {extractedText.substring(0, 2000)}
            {extractedText.length > 2000 && "... (text truncated for display)"}
          </div>
        </div>
      )}
      
      {/* Summarization progress */}
      {summaryStatus === SummarizationStatus.PROCESSING && (
        <div className="summary-progress-container">
          <h3>Generating Summary...</h3>
          <ProgressBar progress={summaryProgress} type="summary" />
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
  
    </div>
  );
};

// Main FileUploader component with context provider
export default function FileUploader() {
  return (
    <FileUploaderProvider>
      <FileUploaderContent />
    </FileUploaderProvider>
  );
}