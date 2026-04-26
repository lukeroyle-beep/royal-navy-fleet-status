export class TimelineControls {
  constructor({ playPause, scrubber, speed, onPlayChange, onScrub }) {
    this.playPause = playPause;
    this.scrubber = scrubber;
    this.speed = speed;
    this.onPlayChange = onPlayChange;
    this.onScrub = onScrub;
    this.playing = false;
    this.start = 0;
    this.end = 1;

    this.playPause.addEventListener("click", () => {
      this.setPlaying(!this.playing);
      this.onPlayChange(this.playing);
    });

    this.scrubber.addEventListener("input", () => {
      const progress = Number(this.scrubber.value) / 1000;
      this.setPlaying(false);
      this.onScrub(this.start + (this.end - this.start) * progress);
    });
  }

  bindRange(start, end) {
    this.start = start;
    this.end = end;
  }

  setPlaying(playing) {
    this.playing = playing;
    this.playPause.classList.toggle("is-playing", playing);
    this.playPause.setAttribute("aria-label", playing ? "Pause replay" : "Play replay");
  }

  setTime(time) {
    this.scrubber.value = ((time - this.start) / (this.end - this.start)) * 1000;
  }

  getSpeed() {
    return Number(this.speed.value);
  }
}

