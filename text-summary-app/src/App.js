import FileUploader from './components/FileUploader';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1>Text Summarization App</h1>
      <p>Upload a file to extract and summarize text</p>
      <FileUploader/>
    </div>
  );
}

export default App;