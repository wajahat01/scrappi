chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeData") {
    console.log("Content script received scrapeData action");
    const scrapedText = document.body.innerText;

    // Send the scraped data back to the background script
    chrome.runtime.sendMessage({ action: "scrapedData", data: scrapedText }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending message from content script:", chrome.runtime.lastError.message);
      } else {
        console.log("Content script sent scrapedData, received response:", response);
      }
    });

    // Return true to indicate that sendResponse will be called asynchronously.
    // While chrome.runtime.sendMessage's callback itself isn't directly what
    // sendResponse is for in the onMessage listener, keeping the channel open
    // is good practice if there were a direct response needed to this specific message.
    // For this particular task, where content.js *initiates* a new message
    // rather than responding to the original `sendResponse`, returning true
    // isn't strictly necessary for `chrome.runtime.sendMessage` to work,
    // but it's a common pattern when dealing with asynchronous operations
    // within `onMessage`.
    return true;
  }
});
