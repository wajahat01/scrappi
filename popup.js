document.addEventListener('DOMContentLoaded', () => {
  const scrapeButton = document.getElementById('scrapeButton');
  const statusMessage = document.getElementById('statusMessage');

  if (!scrapeButton) {
    console.error("Scrape button not found in popup.html");
    if (statusMessage) statusMessage.textContent = "Error: Popup UI not loaded correctly.";
    return;
  }
  if (!statusMessage) {
    console.error("Status message element not found in popup.html");
    // Cannot display status to user if this element is missing.
  }

  scrapeButton.addEventListener('click', () => {
    scrapeButton.disabled = true;
    if (statusMessage) {
      statusMessage.textContent = 'Initiating...';
      statusMessage.style.color = 'black'; // Default color for info
    }
    
    // No direct callback needed here for the initial message send,
    // as status updates will come via separate messages from background.js
    chrome.runtime.sendMessage({ action: "startScrapeAndUpload" }, () => {
        if (chrome.runtime.lastError) {
            // This error means the background script is not listening or there's a setup issue.
            console.error("Popup: Error sending 'startScrapeAndUpload' to background:", chrome.runtime.lastError.message);
            if (statusMessage) {
                statusMessage.textContent = `Error: Could not connect to background script. ${chrome.runtime.lastError.message}`;
                statusMessage.style.color = 'red';
            }
            scrapeButton.disabled = false;
        }
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Popup received message:", message);
    if (!statusMessage) return true; // Cannot update UI if element is missing

    // The prompt suggested `message.action === "statusUpdate"` and then `message.status`
    // The existing background.js sends action: "updateStatus", "error", "success" directly.
    // Let's adapt to the existing background.js structure for smoother integration.
    
    statusMessage.textContent = message.message || ''; // Set base message

    if (message.action === "error") {
      statusMessage.style.color = "red";
      // The details field isn't currently sent by background.js but can be added later.
      // if (message.details) {
      //   statusMessage.textContent += " Details: " + message.details;
      // }
      scrapeButton.disabled = false;
    } else if (message.action === "success") {
      statusMessage.style.color = "green";
      if (message.url) {
        statusMessage.textContent = message.message + " "; // Add a space before the link
        const link = document.createElement('a');
        link.href = message.url;
        link.textContent = "Open Doc"; // Shorter link text
        link.target = "_blank";
        statusMessage.appendChild(link);
      }
      scrapeButton.disabled = false;
    } else if (message.action === "updateStatus") { // For intermediate info messages
      statusMessage.style.color = "black";
      // Button remains disabled during intermediate updates
    } else {
      // Generic handler for other unrecognised messages, if any
      statusMessage.style.color = "orange";
      statusMessage.textContent = `Unknown message: ${JSON.stringify(message)}`;
      scrapeButton.disabled = false; // Re-enable button on unknown message type
    }
    
    // sendResponse can be used if the sender (background.js) expects a reply
    // For these status updates, it's usually not necessary.
    // sendResponse({ received: true });
    return true; // Keep channel open for potential async sendResponse
  });
});
