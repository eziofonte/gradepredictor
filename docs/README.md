# Academic Performance Estimator

## Project Overview
A web-based application for estimating academic performance based on study habits and cellphone usage patterns. Built with HTML, CSS, and JavaScript.

## Project Structure
```
acad-perf/
├── index.html              # Home page
├── style.css               # Main stylesheet
├── html/                   # HTML pages
│   ├── index.html          # Home
│   ├── assessment.html     # Assessment form
│   ├── dashboard.html      # Results dashboard
│   ├── history.html        # History view
│   ├── hiw.html            # How it works
│   └── chatbot.html        # Chatbot interface
├── js/                     # JavaScript files
│   ├── script.js           # Main script
│   ├── assessment.js       # Assessment logic
│   ├── dashboard.js        # Dashboard logic
│   ├── history.js          # History logic
│   └── storage.js          # Local storage utilities
├── assets/                 # Images, icons, media (to be added)
└── docs/                   # Documentation
    └── README.md           # This file
```

## How to Run

### Option 1: Direct File Access (Recommended for Development)
1. Navigate to the `html/` folder
2. Double-click any HTML file to open in your browser
3. The CSS will load correctly via relative paths (`../style.css`)

### Option 2: Local Development Server
Choose one of these methods to run a local server:

**Python (if available):**
```bash
cd "C:\Users\dwayn\Documents\VS\acad-perf"
python -m http.server 8000
# Then visit: http://localhost:8000/html/index.html
```

**Node.js (if npm available):**
```bash
cd "C:\Users\dwayn\Documents\VS\acad-perf"
npx http-server -p 8000
# Then visit: http://localhost:8000/html/index.html
```

**VS Code Live Server Extension:**
1. Install the "Live Server" extension in VS Code
2. Right-click on any HTML file in the html/ folder
3. Select "Open with Live Server"

## Current Status
- ✅ UI/HTML/CSS structure complete
- ⚠️ JavaScript logic is placeholder (work in progress)
- ⚠️ Backend/API integration pending
- ⚠️ Data collection for model training pending

## Styling System
- Uses CSS variables for easy theming (`--ink`, `--paper`, `--maroon`, `--gold`, `--rule`, `--muted`)
- Responsive design with mobile-first approach
- Clean, accessible color scheme based on PLM colors
- Consistent spacing and typography system

## Performance Optimization Suggestions (for future implementation)

### 1. CSS Optimization
- **Minify CSS**: Remove whitespace/comments for production
- **Critical CSS**: Extract above-the-fold CSS for faster initial render
- **CSS Variables**: Already implemented for easy theming and maintenance

### 2. HTML Optimization
- **Minify HTML**: Remove unnecessary whitespace and comments
- **Preload Fonts**: Add `rel="preload"` for Google Fonts
- **Resource Hints**: Use `rel="preconnect"` for external resources (already implemented)

### 3. JavaScript Optimization (when logic is implemented)
- **Code Splitting**: Split JS by page/functionality
- **Minification**: Minify JS files for production
- **Defer Loading**: Add `defer` attribute to non-critical scripts
- **Local Storage**: Efficient storage of assessment results

### 4. Asset Optimization (when assets are added)
- **Image Compression**: Use appropriate formats (WebP, AVIF) and compression
- **SVG Icons**: Use SVG for icons where possible
- **Lazy Loading**: Implement lazy loading for below-the-fold images

### 5. Caching Strategy
- **Browser Caching**: Set appropriate cache headers for static assets
- **Service Workers**: Consider for offline capability and advanced caching
- **Cache Busting**: Use filename hashing for cache invalidation when files change

## Next Steps
1. Implement actual calculation logic in JavaScript files
2. Connect to backend API for predictions
3. Add data visualization components
4. Enhance chatbot functionality
5. Add user authentication (if needed)
6. Implement performance optimizations listed above