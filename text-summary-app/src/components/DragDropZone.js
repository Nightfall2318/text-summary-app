import React, { useState, useRef } from 'react';
import '../styles/DragDropZone.css';

// Configuration options
const MAX_FILE_SIZE_MB = 10; // Maximum file size in MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

const DragDropZone = ({ onFilesSelected }) => {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  
  // Validate file size and type
  const validateFile = (file) => {
    if (!file) {
      return {
        valid: false,
        error: 'Invalid file object'
      };
    }
    
    // Size validation
    const fileSizeInMB = (file.size || 0) / (1024 * 1024);
    if (fileSizeInMB > MAX_FILE_SIZE_MB) {
      return {
        valid: false,
        error: `File ${file.name || 'Unknown'} exceeds maximum size of ${MAX_FILE_SIZE_MB}MB`
      };
    }

    // Type validation (if ALLOWED_FILE_TYPES is not empty)
    const fileType = file.type || '';
    if (ALLOWED_FILE_TYPES.length > 0 && !ALLOWED_FILE_TYPES.includes(fileType)) {
      return {
        valid: false,
        error: `File ${file.name || 'Unknown'} has unsupported type: ${fileType || 'unknown'}`
      };
    }

    return { valid: true };
  };

  // Handle drag events
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle drop event
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Handle file input change
  const handleChange = (e) => {
    e.preventDefault();
    
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  // Process the files
  const handleFiles = (fileList) => {
    // Guard against null or undefined fileList
    if (!fileList) return;
    
    const selectedFiles = Array.from(fileList);
    
    if (selectedFiles.length === 0) return;
    
    // Validate each file
    const newErrors = [];
    const validFiles = selectedFiles.filter(file => {
      // Guard against invalid file objects
      if (!file) return false;
      
      const validation = validateFile(file);
      if (!validation.valid) {
        newErrors.push(validation.error);
        return false;
      }
      return true;
    });

    // Pass validated files and errors to parent component
    if (onFilesSelected) {
      onFilesSelected(validFiles, newErrors);
    }
  };

  // Trigger file input click
  const onButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div 
      className={`drag-drop-zone ${dragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleChange}
        multiple
        className="file-input"
        style={{ display: 'none' }} 
      />
      
      <div className="drag-drop-content">
        <div className="drag-drop-icon">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#4a90e2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5V19M12 5L8 9M12 5L16 9" />
            <path d="M4 15V17C4 18.1046 4.89543 19 6 19H18C19.1046 19 20 18.1046 20 17V15" />
          </svg>
        </div>
        
        <h3 className="drag-heading">Drop files here</h3>
        
        <div className="drag-drop-divider">
          <span>or</span>
        </div>
        
        <button 
          onClick={onButtonClick}
          className="browse-button"
        >
          Browse Files
        </button>
        
        <div className="file-info-container">
          <div className="file-info-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>Supported formats: PDF, DOCX, JPG, PNG, TXT</span>
          </div>
          <div className="file-info-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Maximum size: {MAX_FILE_SIZE_MB}MB per file</span>
          </div>
        </div>
      </div>

      {dragActive && (
        <div 
          className="drag-overlay"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        ></div>
      )}
    </div>
  );
};

export default DragDropZone;