import React, { createContext, useReducer, useContext } from 'react';

// Define status constants
export const UploadStatus = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PAUSED: 'paused',
  SUCCESS: 'success',
  ERROR: 'error'
};

export const SummarizationStatus = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Define action types
export const ACTIONS = {
  SET_FILES: 'SET_FILES',
  SELECT_FILE: 'SELECT_FILE',
  DESELECT_FILE: 'DESELECT_FILE',
  SELECT_ALL_FILES: 'SELECT_ALL_FILES',
  DESELECT_ALL_FILES: 'DESELECT_ALL_FILES',
  SET_STATUS: 'SET_STATUS',
  SET_UPLOAD_PROGRESS: 'SET_UPLOAD_PROGRESS',
  SET_ERRORS: 'SET_ERRORS',
  CLEAR_ERRORS: 'CLEAR_ERRORS',
  SET_OVERALL_PROGRESS: 'SET_OVERALL_PROGRESS',
  SET_UPLOAD_RESULTS: 'SET_UPLOAD_RESULTS',
  SET_EXTRACTED_TEXT: 'SET_EXTRACTED_TEXT',
  SET_FILE_METADATA: 'SET_FILE_METADATA',
  SET_SUMMARY: 'SET_SUMMARY',
  SET_SUMMARY_TASK_ID: 'SET_SUMMARY_TASK_ID',
  SET_FILE_ID: 'SET_FILE_ID',
  SET_SUMMARY_STATUS: 'SET_SUMMARY_STATUS',
  SET_SUMMARY_PROGRESS: 'SET_SUMMARY_PROGRESS',
  SET_SUMMARY_LENGTH: 'SET_SUMMARY_LENGTH',
  TOGGLE_METADATA_DISPLAY: 'TOGGLE_METADATA_DISPLAY',
  RESET_STATE: 'RESET_STATE',
  PAUSE_FILE: 'PAUSE_FILE',
  RESUME_FILE: 'RESUME_FILE',
  REMOVE_FILE: 'REMOVE_FILE',
  SET_DRAG_ACTIVE: 'SET_DRAG_ACTIVE'
};

// Initial state
const initialState = {
  files: [],
  selectedFiles: [],
  status: UploadStatus.IDLE,
  uploadProgress: {},
  pausedFiles: {},
  errors: [],
  overallProgress: 0,
  uploadResults: [],
  extractedText: "",
  fileMetadata: null,
  summary: "",
  summaryTaskId: null,
  fileId: null,
  summaryStatus: SummarizationStatus.IDLE,
  summaryProgress: 0,
  summaryLength: 150,
  showMetadata: true,
  dragActive: false
};

// Reducer function
const fileUploaderReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.SET_FILES:
      return {
        ...state,
        files: action.payload,
        selectedFiles: action.payload.map(file => file.name) // By default all files are selected
      };
    
    case ACTIONS.SELECT_FILE:
      return {
        ...state,
        selectedFiles: [...state.selectedFiles, action.payload]
      };
    
    case ACTIONS.DESELECT_FILE:
      return {
        ...state,
        selectedFiles: state.selectedFiles.filter(name => name !== action.payload)
      };
    
    case ACTIONS.SELECT_ALL_FILES:
      return {
        ...state,
        selectedFiles: state.files.map(file => file.name)
      };
    
    case ACTIONS.DESELECT_ALL_FILES:
      return {
        ...state,
        selectedFiles: []
      };
    
    case ACTIONS.SET_STATUS:
      return {
        ...state,
        status: action.payload
      };
    
    case ACTIONS.SET_UPLOAD_PROGRESS:
      return {
        ...state,
        uploadProgress: {
          ...state.uploadProgress,
          [action.payload.fileName]: action.payload.progress
        }
      };
    
    case ACTIONS.SET_ERRORS:
      return {
        ...state,
        errors: [...state.errors, action.payload]
      };
    
    case ACTIONS.CLEAR_ERRORS:
      return {
        ...state,
        errors: []
      };
    
    case ACTIONS.SET_OVERALL_PROGRESS:
      return {
        ...state,
        overallProgress: action.payload
      };
    
    case ACTIONS.SET_UPLOAD_RESULTS:
      return {
        ...state,
        uploadResults: [...state.uploadResults, action.payload]
      };
    
    case ACTIONS.SET_EXTRACTED_TEXT:
      return {
        ...state,
        extractedText: action.payload
      };
    
    case ACTIONS.SET_FILE_METADATA:
      return {
        ...state,
        fileMetadata: action.payload
      };
    
    case ACTIONS.SET_SUMMARY:
      return {
        ...state,
        summary: action.payload
      };
    
    case ACTIONS.SET_SUMMARY_TASK_ID:
      return {
        ...state,
        summaryTaskId: action.payload
      };
    
    case ACTIONS.SET_FILE_ID:
      return {
        ...state,
        fileId: action.payload
      };
    
    case ACTIONS.SET_SUMMARY_STATUS:
      return {
        ...state,
        summaryStatus: action.payload
      };
    
    case ACTIONS.SET_SUMMARY_PROGRESS:
      return {
        ...state,
        summaryProgress: action.payload
      };
    
    case ACTIONS.SET_SUMMARY_LENGTH:
      return {
        ...state,
        summaryLength: action.payload
      };
    
    case ACTIONS.TOGGLE_METADATA_DISPLAY:
      return {
        ...state,
        showMetadata: !state.showMetadata
      };
    
    case ACTIONS.RESET_STATE:
      return {
        ...initialState
      };
    
    case ACTIONS.PAUSE_FILE:
      return {
        ...state,
        pausedFiles: {
          ...state.pausedFiles,
          [action.payload]: true
        }
      };
    
    case ACTIONS.RESUME_FILE:
      const newPausedFiles = {...state.pausedFiles};
      delete newPausedFiles[action.payload];
      
      return {
        ...state,
        pausedFiles: newPausedFiles
      };
    
    case ACTIONS.REMOVE_FILE:
      const filteredFiles = state.files.filter(file => file.name !== action.payload);
      const filteredSelected = state.selectedFiles.filter(name => name !== action.payload);
      
      // Also clear progress for this file
      const newProgress = {...state.uploadProgress};
      delete newProgress[action.payload];
      
      // And remove from paused files
      const updatedPausedFiles = {...state.pausedFiles};
      delete updatedPausedFiles[action.payload];
      
      return {
        ...state,
        files: filteredFiles,
        selectedFiles: filteredSelected,
        uploadProgress: newProgress,
        pausedFiles: updatedPausedFiles
      };
    
    case ACTIONS.SET_DRAG_ACTIVE:
      return {
        ...state,
        dragActive: action.payload
      };
      
    default:
      return state;
  }
};

// Create the context
const FileUploaderContext = createContext();

// Create the provider component
export const FileUploaderProvider = ({ children }) => {
  const [state, dispatch] = useReducer(fileUploaderReducer, initialState);
  
  return (
    <FileUploaderContext.Provider value={{ state, dispatch }}>
      {children}
    </FileUploaderContext.Provider>
  );
};

// Custom hook to use the file uploader context
export const useFileUploader = () => {
  const context = useContext(FileUploaderContext);
  if (!context) {
    throw new Error('useFileUploader must be used within a FileUploaderProvider');
  }
  return context;
};