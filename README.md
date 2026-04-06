# ChatGPT DOM Trimmer

A lightweight Chrome extension that keeps long ChatGPT web conversations responsive by collapsing older turns into placeholders.

## Features

- Keeps only the most recent turns rendered
- Collapses older turns automatically or on demand
- Restores hidden turns in batches or all at once
- Persists settings with `chrome.storage.local`
- Works on `chatgpt.com` and `chat.openai.com`

## Installation

1. Download or clone this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this project folder
6. Open ChatGPT and refresh the page
7. Open Chrome’s side panel and select **ChatGPT DOM Trimmer**

## Usage

Set:

- **Keep visible turns**
- **Restore batch**
- **Auto-collapse**

Then use:

- **Apply**
- **Collapse now**
- **Restore batch**
- **Restore all**

## Notes

- This extension only modifies the page DOM in your browser
- It does **not** delete your ChatGPT conversation history
- If ChatGPT changes its DOM structure, selectors in `content.js` may need to be updated

## Development

After making changes:

1. Go to `chrome://extensions`
2. Reload the extension
3. Refresh the ChatGPT tab
