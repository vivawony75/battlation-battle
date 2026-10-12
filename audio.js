/**
 * 배틀레이션 (Battleration) - Web Audio API 기반 절차적 사운드 신시사이저 엔진
 * 외부 파일 의존성 없이 순수 브라우저 내장 오디오 합성으로 군사 효과음 재생
 */

class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.5;
    }
    return this.muted;
  }

  // 박격포/포격 발사음 (쿵~ 하는 묵직한 발사음)
  playLaunch() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // 서브베이스 발사 붐
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.4);

    // 공기 파열음 (화약 격발 노이즈)
    this.playNoise(t, 0.25, 300, 80, 0.4);
  }

  // 포탄 비행 휘슬 소리 (장거리 강하 휘슬음)
  playWhistle() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 1.8);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 1.85);
  }

  // 빗나감 (공터 명중 - 퍽! 흙먼지 튀는 소리)
  playMiss() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 둔탁한 타격
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.25);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.3);

    // 흙먼지 날리는 부드러운 노이즈
    this.playNoise(t, 0.35, 450, 60, 0.35);
  }

  // 명중 (유닛 피격 - 웅장하고 거대한 81mm 고폭탄 폭발음: 쾅콰콰쾅!)
  playHit() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. 깊은 서브우퍼 지진 저음 충격파 (Sub-bass rumble)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(95, t);
    subOsc.frequency.exponentialRampToValueAtTime(18, t + 1.2);

    subGain.gain.setValueAtTime(0.9, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.25);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(t);
    subOsc.stop(t + 1.3);

    // 2. 묵직한 본체 폭발 (Heavy body explosion)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.9);

    gain.gain.setValueAtTime(0.95, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.95);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(80, t + 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 1.0);

    // 3. 거대한 화약 파열 노이즈 & 잔향 (Long explosive rumble reverb)
    this.playNoise(t, 1.1, 1400, 70, 0.85);
    this.playNoise(t + 0.05, 0.6, 600, 40, 0.5);
  }

  // 기관총 진지 웅장한 대구경 발사음 (쿵-타앙!)
  playHeavyMGShot() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 대구경 펀치감 있는 저음 타격 (Heavy Punch)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.2);

    // 날카롭고 묵직한 격발 노이즈
    this.playNoise(t, 0.18, 1100, 150, 0.55);
  }

  // 산맥 차폐 / 사각지대 도탄음 (팅~ 둔탁한 암석 타격)
  playDeflect() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(750, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.4);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.45);

    this.playNoise(t, 0.2, 800, 200, 0.3);
  }

  // 조명탄 발사 및 타오르는 소리
  playFlare() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 조명탄 상승 휘익~
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.linearRampToValueAtTime(1100, t + 0.5);

    gain.gain.setValueAtTime(0.02, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.65);

    // 타오르는 불꽃 지글거림
    this.playNoise(t + 0.4, 0.9, 1600, 700, 0.3);
  }

  // 부대 완파 사이렌 / 경보음
  playUnitDestroyed() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 2단 경보 비프
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + i * 0.18;

      osc.type = 'square';
      osc.frequency.setValueAtTime(440, st);
      osc.frequency.setValueAtTime(880, st + 0.08);

      gain.gain.setValueAtTime(0.2, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.16);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(st);
      osc.stop(st + 0.17);
    }
  }

  // 타겟 선택/해제 UI 비프음
  playBeep(freq = 600) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  // 승리 팡파르
  playVictory() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C, E, G, C, E, G
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.25, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + (idx === notes.length - 1 ? 1.2 : 0.3));

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(st);
      osc.stop(st + (idx === notes.length - 1 ? 1.3 : 0.35));
    });
  }

  // 패배 효과음
  playDefeat() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 392, 349.23, 293.66, 220];
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = t + idx * 0.22;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.2, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(st);
      osc.stop(st + 0.5);
    });
  }

  // 헬퍼: 밴드패스/로우패스 필터링된 버퍼 노이즈 재생
  playNoise(startTime, duration, startFreq, endFreq, maxGain = 0.5) {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), startTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(maxGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start(startTime);
    whiteNoise.stop(startTime + duration + 0.05);
  }
}

// 전역 인스턴스
window.soundFX = new SoundFX();
