import React from 'react';
import '../styles/FileItem.css';


const FileItem = ({ 
  file,
  isSelected,
  isPaused,
  progress,
  onSelect,
  onRemove,
  onTogglePause,
  isUploading
}) => {
  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  // Get file type icon
  const getFileIcon = (fileType) => {
    const iconMap = {
      'image': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      ),
      'application/pdf': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      ),
      'text': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      ),
      'application': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      )
    };

    if (!fileType) return iconMap['application'];
    
    // Check if it's an image
    if (fileType.startsWith('image/')) {
      return iconMap['image'];
    }
    
    // Return the specific icon or the generic one
    return iconMap[fileType] || iconMap['application'];
  };

  // Calculate progress status
  const getProgressStatus = () => {
    if (progress === undefined || progress === null) return '';
    if (progress === -1) return 'Failed';
    if (progress === 100) return 'Complete';
    if (isPaused) return 'Paused';
    return `${progress}%`;
  };

  // Get appropriate progress color
  const getProgressColor = () => {
    if (progress === -1) return '#f44336'; // Failed - red
    if (progress === 100) return '#4caf50'; // Complete - green
    if (isPaused) return '#ff9800'; // Paused - orange
    return '#2196f3'; // In progress - blue
  };

  const handleSelect = (e) => {
    e.stopPropagation();
    onSelect(file.name);
  };

  const handleTogglePause = (e) => {
    e.stopPropagation();
    onTogglePause(file.name);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onRemove(file.name);
  };

  // Get file extension
  const getFileExtension = (filename) => {
    return filename.split('.').pop().toUpperCase();
  };

  return (
    <div 
      className={`file-item ${isSelected ? 'file-item-selected' : ''} ${progress === 100 ? 'file-item-complete' : ''}`}
      onClick={handleSelect}
    >
      <div className="file-item-container">
        <div className="file-item-checkbox">
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={handleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        
        <div className="file-item-icon">
          {getFileIcon(file.type)}
          <span className="file-extension">{getFileExtension(file.name)}</span>
        </div>
        
        <div className="file-item-details">
          <div className="file-name-container">
            <p className="file-name">{file.name}</p>
            <span className="file-size">{formatFileSize(file.size)}</span>
          </div>
          
          {progress !== undefined && (
            <div className="file-progress-container">
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${progress === -1 ? 100 : progress}%`,
                    backgroundColor: getProgressColor(),
                    opacity: isPaused ? 0.7 : 1
                  }}
                ></div>
              </div>
              <span className="progress-text">{getProgressStatus()}</span>
            </div>
          )}
        </div>
        
        <div className="file-item-actions">
          {isUploading && (
            <button 
              className="file-action-button"
              onClick={handleTogglePause}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
              )}
            </button>
          )}
          
          {!isUploading && (
            <button 
              className="file-action-button remove"
              onClick={handleRemove}
              title="Remove"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileItem;