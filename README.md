# AI Chat Stats Overlay (for ChatGPT)

A lightweight browser extension that provides a floating statistics widget for ChatGPT, helping you track your usage patterns, manage notes, and stay focused on your goals.

## 🌟 Features

### Real-Time Activity Tracking (No Import Required)
- **Active Time Tracking**: Automatically tracks how long you're actively using ChatGPT
  - Monitors mouse movements, keyboard input, scrolling, and clicks
  - Only counts time when you're actively engaged (60-second idle timeout)
  - Updates every 5 seconds for accurate tracking
  - Persists across browser sessions

- **Session Tracking**: Counts your ChatGPT sessions throughout the day
  - Automatically detects new sessions (30-minute gap between activities)
  - Resets daily at midnight
  - Tracks sessions only when tab is active and you're engaged

### Notes & Goals (v1.1)
- **Top Priority Goal**: Set a focused goal and track its deadline
- **Urgent Visual Feedback**: Goals now feature "Urgent" styling (red pulses) when added or overdue
- **Scratchpad**: A simplified, persistent workspace for notes that auto-saves instantly
- **Pinned Snippets**: Quick-copy bank for frequently used prompts/snippets
- **Live Countdown**: See exactly how much time is left for your goal in the overlay

### User Interface & Experience
- **Ultra-Compact Mode**: Optimized width for **13-inch laptop screens** to prevent blocking chat messages.
- **Responsive Layout**: Switches to a single-column grid on smaller windows for maximum readability.
- **Enhanced Minimized Pill**: A sleek, hover-animated pill that displays:
  - **Live Active Time Today**
  - **Goal Preview** (abbreviated text of your top goal)
  - **Sleek Interactions**: Glows and transforms into "ChatGPT Green" on hover.
- **Draggable Widget**: Move the stats panel anywhere on your screen; positions are saved automatically.
- **Stability Engine**: Handles extension updates/reloads gracefully with safe storage wrappers.
- **Clean Aesthetic**: Modern glassmorphism design that feels native to the ChatGPT interface.

### Optional History Statistics (Import-Based)
Enable the import feature to analyze your historical ChatGPT usage:
- **Total Conversations**: Complete count of all your ChatGPT conversations.
- **Activity Summary**: Breakdown of activity from the **Last 7 Days** and **Current Month**.
- **Top Keywords**: Most frequently used words from your conversation titles.
- **Automatic Hiding**: This entire section stays hidden until you import data, keeping your UI clean.

## 📦 Installation

### For Chrome/Edge/Brave

1. Download or clone this repository
2. Open your browser and navigate to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the folder containing this extension
6. Navigate to [ChatGPT](https://chatgpt.com) or [chat.openai.com](https://chat.openai.com)
7. The stats widget will appear in the top-right corner

## 🚀 Usage

### Basic Usage (No Setup Required)
Once installed, the extension automatically starts tracking:
- Your active time on ChatGPT
- Number of sessions per day

The widget displays this information in real-time without any configuration needed.

### Importing Conversation History (Optional)

To view historical statistics:

1. **Export your ChatGPT data**:
   - Go to ChatGPT Settings → Data Controls → Export Data
   - Wait for the email with your data export
   - Download and extract the `conversations.json` file

2. **Enable import in the extension**:
   - Check the box: "Enable Import (history stats from conversations.json)"
   - Click the "Import" button
   - Select your `conversations.json` file

3. **View your stats**:
   - Total conversations
   - Recent activity (last 7 days, this month)
   - Top keywords from your conversation titles

## 🔒 Privacy & Data Storage

- **100% Local**: All data is stored locally in your browser using Chrome's storage API
- **No External Servers**: No data is sent to any external servers
- **No Tracking**: The extension doesn't track or collect any personal information
- **Optional Import**: History statistics are completely optional and only processed if you choose to import

## 📊 What Gets Tracked

### Automatic (Always On)
- Active seconds on ChatGPT (only when tab is visible and you're interacting)
- Number of sessions today
- Widget position and minimized state

### Manual Import (Optional)
- Total conversation count
- Conversations from last 7 days
- Conversations this month
- Top keywords from conversation titles
- Import timestamp

## 🛠️ Technical Details

- **Manifest Version**: 3
- **Permissions**: `storage` (for local data persistence)
- **Supported Sites**: 
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
- **Files**:
  - `content.js`: Main tracking and UI logic
  - `utils.js`: Data processing utilities
  - `styles.css`: Widget styling
  - `manifest.json`: Extension configuration

### Activity Detection
- **Idle Timeout**: 60 seconds (stops counting if no activity)
- **Session Gap**: 30 minutes (new session after this period of inactivity)
- **Update Interval**: 5 seconds (how often stats are updated)

## 🎨 Customization

The widget is designed to be unobtrusive:
- Positioned below ChatGPT's share button area
- Semi-transparent dark background
- Draggable to any position
- Minimizable to a small pill

## 🐛 Troubleshooting

**Widget not appearing?**
- Refresh the ChatGPT page
- Check that the extension is enabled in your browser's extension settings
- Make sure you're on `chatgpt.com` or `chat.openai.com`

**Import not working?**
- Ensure you've checked the "Enable Import" checkbox first
- Verify you're selecting the correct `conversations.json` file
- Check browser console for error messages

**Stats not updating?**
- Click the refresh button (↻)
- Make sure the tab is active and visible
- Check that you're actively interacting with the page

## 📝 License

This project is open source and available for personal use.

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

---

**Note**: This extension is not affiliated with or endorsed by OpenAI.

