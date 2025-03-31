import React, { useState, useRef } from 'react';
import '../styles/FileUploader.css';

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
        className="file-input hidden"
        style={{ display: 'none' }} // Hide the input
      />
      
      <div className="drag-drop-content">
        <div className="drag-drop-icon">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M12 5L8 9M12 5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 15V17C4 18.1046 4.89543 19 6 19H18C19.1046 19 20 18.1046 20 17V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3>Drag & Drop files here</h3>
        <p>or</p>
        <button 
          onClick={onButtonClick}
          className="browse-button"
        >
          Browse Files
        </button>
        <p className="file-types-hint">
          Supported file types: PDF, DOCX, JPG, PNG, TXT
        </p>
        <p className="file-size-hint">
          Maximum file size: {MAX_FILE_SIZE_MB}MB
        </p>
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