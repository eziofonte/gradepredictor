// Chatbot Widget - Floating chat interface
document.addEventListener('DOMContentLoaded', function() {
  // Create chatbot widget elements
  const widget = document.createElement('div');
  widget.className = 'chatbot-widget';
  widget.innerHTML = `
    <button class="chatbot-button" aria-label="Open chatbot">💬</button>
    <div class="chatbot-panel">
      <div class="chatbot-panel-header">
        <h3>Study Companion Chatbot</h3>
      </div>
      <div class="chatbot-panel-content">
        <div class="chatbot-placeholder">
          💬 Not connected yet.
        </div>
      </div>
      <div class="chatbot-panel-footer">
        <button class="chatbot-close-btn">Close</button>
      </div>
    </div>
  `;
  
  // Add widget to page
  document.body.appendChild(widget);
  
  // Get references to elements
  const button = widget.querySelector('.chatbot-button');
  const panel = widget.querySelector('.chatbot-panel');
  const closeBtn = widget.querySelector('.chatbot-close-btn');
  
  // Toggle panel visibility
  button.addEventListener('click', function() {
    panel.classList.toggle('active');
  });
  
  closeBtn.addEventListener('click', function() {
    panel.classList.remove('active');
  });
  
  // Close panel when clicking outside
  document.addEventListener('click', function(e) {
    if (!widget.contains(e.target)) {
      panel.classList.remove('active');
    }
  });
  
  // Prevent closing when clicking inside panel
  panel.addEventListener('click', function(e) {
    e.stopPropagation();
  });
});
