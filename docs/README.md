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

The application requires its Flask backend and a MySQL database. See
[Personal history setup and deployment](DEPLOYMENT.md) for the migration,
Microsoft sign-in, backup, and local startup instructions. Direct HTML or static
file servers do not support the assessment API or personal history.

## Current Status

- The estimator and private account-backed history run through Flask.
- PLM Microsoft sign-in has passed the local integration proof.
- Production hosting, backups, and a two-account pilot remain deployment tasks.

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
4. Add user authentication (if needed)
5. Implement performance optimizations listed above
