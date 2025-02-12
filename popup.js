document.addEventListener('DOMContentLoaded', function() {
  const initialSetup = document.getElementById('initialSetup');
  const jobDescription = document.getElementById('jobDescription');
  const statusDiv = document.getElementById('status');
  
  // Create a storage wrapper to handle both extension and web storage
  const storage = {
    // Check if we're in a Chrome extension
    isExtension: typeof chrome !== 'undefined' && chrome.storage,
    
    // Get data from storage
    async get(keys) {
      if (this.isExtension) {
        return new Promise(resolve => chrome.storage.local.get(keys, resolve));
      } else {
        const result = {};
        keys.forEach(key => {
          result[key] = localStorage.getItem(key);
          if (result[key]) {
            try {
              result[key] = JSON.parse(result[key]);
            } catch (e) {
              // Keep as string if not JSON
            }
          }
        });
        return result;
      }
    },
    
    // Set data to storage
    async set(data) {
      if (this.isExtension) {
        return new Promise(resolve => chrome.storage.local.set(data, resolve));
      } else {
        Object.entries(data).forEach(([key, value]) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
      }
    }
  };

  // Check if setup is already done and load saved applications
  storage.get(['email', 'resumeContent', 'applications']).then(result => {
    if (result.email && result.resumeContent) {
      initialSetup.style.display = 'none';
      jobDescription.style.display = 'block';
      
      // If there are saved applications, display them
      if (result.applications && result.applications.length > 0) {
        displaySavedApplications(result.applications);
      }
    }
  });

  // Handle initial setup
  document.getElementById('saveSetup').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const resumeFile = document.getElementById('resume').files[0];
    
    if (!email || !resumeFile) {
      statusDiv.textContent = 'Please fill in all fields';
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        await storage.set({
          email: email,
          resumeContent: e.target.result,
          resumeName: resumeFile.name,
          applications: []
        });

        initialSetup.style.display = 'none';
        jobDescription.style.display = 'block';
        statusDiv.textContent = 'Setup saved successfully!';
      };
      
      reader.readAsText(resumeFile);
    } catch (error) {
      statusDiv.textContent = `Error: ${error.message}`;
    }
  });

  // Handle job processing
  document.getElementById('processJob').addEventListener('click', async () => {
    try {
      statusDiv.textContent = 'Checking server status...';
      const isHealthy = await checkBackendHealth();
      
      if (!isHealthy) {
        throw new Error('Backend server is not responding. Please try again later.');
      }

      const company = document.getElementById('company').value;
      const jobRole = document.getElementById('jobRole').value;
      const description = document.getElementById('description').value;

      if (!company || !jobRole || !description) {
        statusDiv.textContent = 'Please fill in all job details';
        return;
      }

      // Get stored email and resume content
      const { email, resumeContent, resumeName, applications = [] } = 
        await storage.get(['email', 'resumeContent', 'resumeName', 'applications']);

      if (!email || !resumeContent || !resumeName) {
        statusDiv.textContent = 'Please complete the initial setup first';
        return;
      }

      statusDiv.textContent = 'Processing...';

      // Create new file with modified content
      const modifiedTexFile = new File(
        [resumeContent + `\n\n% Job Details\n% Company: ${company}\n% Role: ${jobRole}\n% Description:\n${
          description.split('\n').map(line => `% ${line}`).join('\n')
        }`],
        resumeName,
        { type: 'application/x-tex' }
      );

      // Validate the modified TEX file
      await validateTexFile(modifiedTexFile);

      // Save application details
      const newApplication = {
        company,
        jobRole,
        description,
        date: new Date().toISOString(),
        url: await getCurrentTabUrl()
      };

      // Add to applications array
      applications.push(newApplication);
      await storage.set({ applications });

      // Create form data for API request
      const formData = new FormData();
      formData.append('file', modifiedTexFile);
      formData.append('username', email);
      formData.append('company', company);
      formData.append('jobRole', jobRole);

      statusDiv.textContent = 'Sending to server...';

      // Log the form data for debugging
      console.log('Request details:', {
        url: 'https://just-apply-backend.onrender.com/convert',
        method: 'POST',
        fileSize: modifiedTexFile.size,
        fileName: modifiedTexFile.name,
        username: email,
        company,
        jobRole
      });

      const response = await fetch('https://just-apply-backend.onrender.com/convert', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/pdf, application/json'
        },
        mode: 'no-cors',  // Change to no-cors mode
        cache: 'no-cache',  // Explicit CORS mode
        credentials: 'include'
      });

      if (!response.ok) {
        const text = await response.text(); // Get raw response text
        console.error('Server response text:', text);
        
        let errorMessage = `Server Error (${response.status})`;
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
          console.error('Parsed error data:', errorData);
        } catch (e) {
          console.error('Raw error response:', text);
        }
        
        throw new Error(errorMessage);
      }

      // Check if the response is actually a PDF
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        throw new Error('Invalid response format from server');
      }

      const pdfBlob = await response.blob();
      
      if (pdfBlob.size === 0) {
        throw new Error('Received empty PDF file');
      }

      // Create download link for PDF
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${company}_${jobRole}.pdf`;
      a.click();
      
      // Cleanup
      URL.revokeObjectURL(downloadUrl);
      
      statusDiv.textContent = 'Resume processed successfully!';
      
      // Update displayed applications
      displaySavedApplications(applications);
      
      // Clear job details fields
      document.getElementById('company').value = '';
      document.getElementById('jobRole').value = '';
      document.getElementById('description').value = '';

    } catch (error) {
      console.error('Processing error:', error);
      statusDiv.textContent = `Error: ${error.message}`;
    }
  });
});

// Helper function to get current tab URL
async function getCurrentTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || '';
}

// Helper function to display saved applications
function displaySavedApplications(applications) {
  const container = document.getElementById('savedApplications') || createSavedApplicationsContainer();
  
  container.innerHTML = `
    <h3>Previous Applications</h3>
    ${applications.map((app, index) => `
      <div class="saved-application">
        <strong>${app.company}</strong> - ${app.jobRole}
        <br>
        <small>Applied: ${new Date(app.date).toLocaleDateString()}</small>
        <button onclick="reloadApplication(${index})">Reload</button>
      </div>
    `).join('')}
  `;
}

// Helper function to create saved applications container
function createSavedApplicationsContainer() {
  const container = document.createElement('div');
  container.id = 'savedApplications';
  document.body.appendChild(container);
  return container;
}

// Function to reload a saved application
window.reloadApplication = async function(index) {
  const { applications } = await storage.get(['applications']);
  const app = applications[index];
  
  document.getElementById('company').value = app.company;
  document.getElementById('jobRole').value = app.jobRole;
  document.getElementById('description').value = app.description;
};

// Add this function near the top of your file
async function validateTexFile(file) {
  if (!file.name.endsWith('.tex')) {
    throw new Error('File must be a .tex file');
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    throw new Error('File size must be less than 5MB');
  }

  // Read first few bytes to verify it's a text file
  const firstChunk = await file.slice(0, 1024).text();
  if (!firstChunk.trim()) {
    throw new Error('File appears to be empty');
  }

  return true;
}

// Modified health check function with better error handling
async function checkBackendHealth() {
    try {
        console.log('Checking backend health...');
        const response = await fetch('https://just-apply-backend.onrender.com/health', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors',  // Use CORS mode so that the full response is available
            cache: 'no-cache'
        });
        
        // Log response headers for debugging
        console.log('Response headers:', {
            cors: response.headers.get('Access-Control-Allow-Origin'),
            contentType: response.headers.get('Content-Type'),
            status: response.status
        });

        const data = await response.json();
        console.log('Health check response:', data);

        if (!response.ok) {
            console.error('Health check failed:', data);
            return false;
        }

        return data.status === 'ok';
    } catch (error) {
        console.error('Health check error:', error);
        return false;
    }
}