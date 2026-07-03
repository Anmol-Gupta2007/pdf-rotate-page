// Global State
let uploadedFile = null; 
let originalFileName = "";
let totalPages = 0;

// This array will hold the current rotation state (in degrees) for each page index.
let pageRotations = []; 


// --- UI Elements ---
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const chooseBtn = document.getElementById('choose-btn');
const outputContainer = document.getElementById('output-container');
const actionBar = document.getElementById('action-bar');
const downloadBtn = document.getElementById('download-btn');
const modal = document.getElementById('processing-modal');

// --- Helper: Download Function ---
function download(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- Event Listeners for Uploading ---
chooseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); 
    fileInput.click();
});

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        processFile(e.target.files[0]);
    }
    fileInput.value = ''; 
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
    }
});

// --- Process Uploaded File ---
async function processFile(file) {
    if (file.type !== 'application/pdf') {
        alert("Please select a valid PDF file.");
        return;
    }

    modal.style.display = 'flex';
    uploadedFile = file;
    originalFileName = file.name.replace('.pdf', '');

    try {
        // Fetch fresh buffer to get the page count
        const arrayBuffer = await uploadedFile.arrayBuffer();
        
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        totalPages = pdfDoc.getPageCount();
        
        // Reset the rotations array with 0 for all pages
        pageRotations = new Array(totalPages).fill(0);
        
        actionBar.style.display = 'block';
        
        // Render visual previews
        await renderPreviews();

    } catch (error) {
        console.error("Error reading PDF:", error);
        alert("Could not process this PDF. It may be corrupted or encrypted.");
    }
    
    modal.style.display = 'none';
}

// --- Render Visual Page Previews ---
async function renderPreviews() {
    outputContainer.innerHTML = '';

    // Fresh buffer for PDF.js to avoid detaching the main buffer
    const previewBuffer = await uploadedFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(previewBuffer) });
    const pdfViewerDoc = await loadingTask.promise;

    for (let i = 0; i < totalPages; i++) {
        const card = document.createElement('div');
        card.className = 'pdf-card';
        card.id = `page-card-${i}`;

        card.innerHTML = `
            <div class="canvas-container">
                <canvas id="canvas-${i}" class="pdf-preview"></canvas>
            </div>
            <div class="pdf-name">Page ${i + 1}</div>
            <div class="card-controls">
                <button class="indiv-rotate-btn" onclick="rotatePage(${i}, -90)" title="Rotate Left">↺</button>
                <button class="indiv-rotate-btn" onclick="rotatePage(${i}, 90)" title="Rotate Right">↻</button>
            </div>
        `;
        
        outputContainer.appendChild(card);

        // Render PDF page onto canvas
        try {
            const page = await pdfViewerDoc.getPage(i + 1);
            const canvas = document.getElementById(`canvas-${i}`);
            const context = canvas.getContext('2d');
            
            const unscaledViewport = page.getViewport({ scale: 1 });
            // Scale the canvas down so its natural max size matches our CSS limits
            const scale = 160 / Math.max(unscaledViewport.width, unscaledViewport.height); 
            const viewport = page.getViewport({ scale: scale });
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
        } catch (err) {
            console.error("Error rendering page", i, err);
        }
    }
}

// --- Individual Rotation Logic ---
window.rotatePage = function(pageIndex, angle) {
    // Update the logical rotation tracker
    pageRotations[pageIndex] = (pageRotations[pageIndex] + angle + 360) % 360;
    
    // Apply visual CSS transform instantly
    const canvas = document.getElementById(`canvas-${pageIndex}`);
    if (canvas) {
        canvas.style.transform = `rotate(${pageRotations[pageIndex]}deg)`;
    }
}

// --- Global Rotation Logic ---
window.rotateAll = function(angle) {
    for (let i = 0; i < totalPages; i++) {
        rotatePage(i, angle);
    }
}

// --- Process and Download Final Rotated PDF ---
downloadBtn.addEventListener('click', async () => {
    if (!uploadedFile) return;

    modal.style.display = 'flex';

    try {
        // Fetch a fresh arrayBuffer from the file to modify
        const arrayBuffer = await uploadedFile.arrayBuffer();
        
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        
        // Loop through all pages and apply user rotations
        for (let i = 0; i < pages.length; i++) {
            if (pageRotations[i] !== 0) {
                const page = pages[i];
                // Get existing internal rotation and add the user's new rotation to it
                const currentRotation = page.getRotation().angle;
                page.setRotation(PDFLib.degrees(currentRotation + pageRotations[i]));
            }
        }

        const newPdfBytes = await pdfDoc.save();
        download(newPdfBytes, `${originalFileName}_Rotated.pdf`, "application/pdf");
        
    } catch (error) {
        console.error("Error rotating PDF:", error);
        alert(`Failed to rotate the PDF. Error: ${error.message}`);
    }
    
    modal.style.display = 'none';
});
