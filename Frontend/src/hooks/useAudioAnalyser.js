import { useState, useEffect, useRef } from 'react';

const useAudioAnalyser = (audioRef) => {
  const [volume, setVolume] = useState(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    // We need an actual audio element to attach to
    if (!audioRef.current) return;

    const initAudio = () => {
      if (!audioContextRef.current) {
        // Create the audio context (handles browser compatibility)
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256; // 256 gives us a nice array of 128 data points

        // Connect the audio element to the analyser, and the analyser to the speakers
        sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
      }
    };

    const updateVolume = () => {
      if (analyserRef.current) {
        // Create an array to hold the audio frequency data
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate the average volume from the array
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Update our React state with the current volume (0 to ~100)
        setVolume(average);
      }
      // Loop this function continuously while playing
      requestRef.current = requestAnimationFrame(updateVolume);
    };

    const handlePlay = () => {
      initAudio();
      // Browsers require audio context to be resumed after a user gesture
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      updateVolume();
    };

    const handlePause = () => {
      cancelAnimationFrame(requestRef.current);
      setVolume(0);
    };

    const audioEl = audioRef.current;
    audioEl.addEventListener('play', handlePlay);
    audioEl.addEventListener('pause', handlePause);
    audioEl.addEventListener('ended', handlePause);

    return () => {
      // Cleanup event listeners when the component unmounts
      audioEl.removeEventListener('play', handlePlay);
      audioEl.removeEventListener('pause', handlePause);
      audioEl.removeEventListener('ended', handlePause);
      cancelAnimationFrame(requestRef.current);
    };
  }, [audioRef]);

  return volume;
};

export default useAudioAnalyser;
