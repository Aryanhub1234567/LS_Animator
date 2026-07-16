const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
// 2. NEW: Import the path to the local binary we just downloaded
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
// 3. NEW: Tell fluent-ffmpeg to use this specific path
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = 3000;

// Enable CORS so the React frontend can communicate with this API
app.use(cors());
app.use(express.json());

// Configure Multer for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    // Ensure the uploads directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Save files with a timestamp to avoid naming conflicts
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// The main export endpoint
// We expect up to 3 files: audio, background, and mouth
app.post('/api/export', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'background', maxCount: 1 },
  { name: 'mouth', maxCount: 1 }
]), (req, res) => {

  console.log("--- NEW EXPORT JOB STARTED ---");

  const files = req.files;
  if (!files || !files.audio || !files.background || !files.mouth) {
    return res.status(400).json({ error: 'Missing required media files.' });
  }

  const audioPath = files.audio[0].path;
  const backgroundPath = files.background[0].path;
  const mouthPath = files.mouth[0].path;


  // Determine final video dimensions
  const { canvasFormat, duration, mouthX, mouthY, mouthSize } = req.body;
  const safeDuration = parseFloat(duration);

  // --- UPGRADE TO 1080p RENDER PIPELINE ---
  let width, height, scaleFactor;

  if (canvasFormat === '16:9') {
    width = 1920;
    height = 1080;
    // Your React preview is 1024px wide. 1920 / 1024 = 1.875
    scaleFactor = 1.875;
  } else { // 9:16 format (Shorts/Reels)
    width = 1080;
    height = 1920;
    // Your React preview is 450px wide. 1080 / 450 = 2.4
    scaleFactor = 2.4;
  }

  // Scale up the coordinates so the mouth stays perfectly aligned on the larger video
  const finalMouthX = mouthX * scaleFactor;
  const finalMouthY = mouthY * scaleFactor;
  const finalMouthSize = mouthSize * scaleFactor;

  const outputFileName = `final-video-${Date.now()}.mp4`;
  const outputPath = path.join(__dirname, 'output', outputFileName);

  console.log(`Spinning up FFmpeg for a Full HD ${width}x${height} render...`);

  // Start building the FFmpeg command
  ffmpeg()
    // Input 0: The static background image (loop it infinitely)
    .input(backgroundPath)
    .loop(1)

    // Input 1: The transparent mouth video (loop it infinitely)
    .input(mouthPath)
    .inputOptions(['-stream_loop -1'])

    // Input 2: The audio voiceover
    .input(audioPath)

    // The Complex Filter: This is where the magic layout happens
    .complexFilter([
      // Scale and pad background
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:white[bg]`,

      // Scale mouth using the new multiplier
      `[1:v]scale=${finalMouthSize}:-1[scaledMouth]`,

      // Overlay the mouth using the scaled X/Y coordinates
      `[bg][scaledMouth]overlay=x=${finalMouthX}:y=${finalMouthY}[outv]`
    ])

    // Map the outputs from the filter
    .outputOptions([
      '-map [outv]',
      '-map 2:a',
      '-c:v libx264',
      '-c:a aac',
      '-b:a 192k',         // FIX 3: Force a specific audio bitrate to guarantee encoding
      '-pix_fmt yuv420p',
      // FIX: We explicitly cut the video at the exact length of the audio track
      `-t ${safeDuration}`
    ])

    // Output the final file
    .save(outputPath)

    // Listen for progress and completion
    .on('progress', (progress) => {
      console.log(`Processing: ${progress.percent ? progress.percent.toFixed(1) : 0}% done`);
    })
    .on('end', () => {
      console.log(`--- EXPORT COMPLETE! Saved to: ${outputFileName} ---`);

      // Tell the React frontend that the video is ready!
      res.json({
        message: "Video rendered successfully!",
        status: "success",
        downloadUrl: `http://localhost:3000/download/${outputFileName}`
      });

      // Optional: Clean up the raw upload files to save hard drive space
      fs.unlinkSync(audioPath);
      fs.unlinkSync(backgroundPath);
      fs.unlinkSync(mouthPath);
    })
    .on('error', (err) => {
      console.error("FFmpeg Error:", err.message);
      res.status(500).json({ error: 'Video rendering failed.', details: err.message });
    });
});

// Add this just above app.listen(...)
app.get('/download/:filename', (req, res) => {
  const file = path.join(__dirname, 'output', req.params.filename);
  res.download(file); // This forces the browser to download the file
});

// Start the server
app.listen(PORT, () => {
  console.log(`Lip-Sync Backend is running on http://localhost:${PORT}`);
});
