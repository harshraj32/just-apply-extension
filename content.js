function getJobDetails() {
  // This is a basic implementation - you might need to adjust selectors based on specific job sites
  const jobTitle = document.querySelector('h1')?.textContent || '';
  const company = document.querySelector('.company-name')?.textContent || 
                 document.querySelector('[data-company]')?.textContent || '';
  
  // Try to find job description - this might need adjustment based on the site
  const jobDescription = document.querySelector('.job-description')?.textContent || 
                        document.querySelector('[data-job-description]')?.textContent || '';
  
  return {
    company: company.trim(),
    jobRole: jobTitle.trim(),
    jobDescription: jobDescription.trim()
  };
}

// Make function available to popup script
window.getJobDetails = getJobDetails; 