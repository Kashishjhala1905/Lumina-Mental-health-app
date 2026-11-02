/* Lumina meditation audio synthesiser – runs in a browser (OfflineAudioContext + WebCodecs AudioEncoder).
 * Every track is ORIGINAL: built only from oscillators, generated noise and a generated reverb.
 * No samples or third-party recordings are used. A seeded PRNG makes output reproducible.
 * Used by generate.cjs; exposes window.LuminaSynth = { TRACKS, renderAndEncode(slug) }.
 */
(function () {
    const SR = 44100;

    function mulberry32(seed) {
        return function () {
            let t = (seed += 0x6d2b79f5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---------- building blocks ----------
    function noiseBuffer(ctx, kind, seconds, rand) {
        const len = Math.floor(SR * seconds);
        const buf = ctx.createBuffer(2, len, SR);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
            for (let i = 0; i < len; i++) {
                const w = rand() * 2 - 1;
                if (kind === 'white') d[i] = w;
                else if (kind === 'pink') { // Paul Kellet's refined pink filter
                    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
                    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
                    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
                } else { // brown
                    last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
                }
            }
        }
        return buf;
    }

    function noiseSource(ctx, kind, rand, seconds = 12) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, kind, seconds, rand);
        src.loop = true;
        return src;
    }

    function reverb(ctx, seconds, rand) {
        const len = Math.floor(SR * seconds);
        const ir = ctx.createBuffer(2, len, SR);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            let lp = 0;
            for (let i = 0; i < len; i++) {
                lp = lp * 0.6 + (rand() * 2 - 1) * 0.4; // gently darkened tail
                d[i] = lp * Math.pow(1 - i / len, 2.6);
            }
        }
        const conv = ctx.createConvolver();
        conv.buffer = ir;
        return conv;
    }

    /** Sustained pad voice: two detuned oscillators → LFO-modulated low-pass → envelope. */
    function pad(ctx, dest, { freq, start, end, type = 'sine', gain = 0.05, attack = 4, release = 4, cutoff = 900, lfo = 0.05, detune = 6, pan = 0 }) {
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(gain, start + attack);
        env.gain.setValueAtTime(gain, Math.max(start + attack, end - release));
        env.gain.linearRampToValueAtTime(0, end);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        mod.frequency.value = lfo;
        modGain.gain.value = cutoff * 0.35;
        mod.connect(modGain).connect(filter.frequency);
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        for (const d of [-detune, detune]) {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.value = freq;
            o.detune.value = d;
            o.connect(filter);
            o.start(start); o.stop(end);
        }
        mod.start(start); mod.stop(end);
        filter.connect(env).connect(panner).connect(dest);
    }

    /** Short plucked/sung note with exponential decay. */
    function note(ctx, dest, { freq, at, gain = 0.05, attack = 0.01, decay = 1.5, type = 'sine', cutoff = 3000, pan = 0 }) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cutoff;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(gain, at + attack);
        g.gain.setTargetAtTime(0, at + attack, decay / 4);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        o.connect(f).connect(g).connect(p).connect(dest);
        o.start(at); o.stop(at + attack + decay * 1.6);
    }

    /** Singing-bowl strike: inharmonic partials with slight beating and long decays. */
    function bowl(ctx, dest, { freq, at, gain = 0.12, pan = 0 }) {
        const partials = [[1, 1, 14], [2.76, 0.5, 9], [5.4, 0.22, 6], [8.93, 0.1, 3.5]];
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(dest);
        for (const [ratio, amp, decay] of partials) {
            for (const beat of [1, 1.0025]) {
                const o = ctx.createOscillator();
                o.frequency.value = freq * ratio * beat;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, at);
                g.gain.linearRampToValueAtTime(gain * amp * 0.5, at + 0.006);
                g.gain.setTargetAtTime(0, at + 0.006, decay / 4);
                o.connect(g).connect(p);
                o.start(at); o.stop(at + decay * 1.5);
            }
        }
    }

    // ---------- track recipes (all durations in seconds) ----------
    const TRACKS = [
        {
            slug: 'guided-body-scan', title: 'Bell-Guided Body Scan', category: 'Guided Meditation', duration: 240,
            description: 'A calm drone with bowl chimes marking each step of a body scan. Follow the on-screen prompts.',
            guide: [
                [0, 'Settle into a comfortable position and gently close your eyes.'],
                [20, 'Bring your attention to your breath. Let it move naturally.'],
                [50, 'Notice your feet and legs. Let them feel heavy and relaxed.'],
                [80, 'Move your attention to your hips, belly and lower back.'],
                [110, 'Notice your chest and shoulders rise and fall with each breath.'],
                [140, 'Relax your arms and hands, all the way to your fingertips.'],
                [170, 'Soften your jaw, your forehead and the muscles around your eyes.'],
                [200, 'Now sense your whole body at once – calm and supported.'],
                [225, 'When you are ready, slowly open your eyes and return.'],
            ],
            build(ctx, { dry, wet, dur, track }) {
                for (const [f, pan] of [[110, -0.3], [164.81, 0.3], [220, 0]]) pad(ctx, dry, { freq: f, start: 0, end: dur, gain: 0.035, attack: 8, release: 8, cutoff: 600, lfo: 0.03, pan });
                track.guide.forEach(([t], i) => bowl(ctx, wet, { freq: i === 0 || i === track.guide.length - 1 ? 220 : 293.66, at: t + 0.5, gain: 0.16, pan: i % 2 ? 0.25 : -0.25 }));
            },
        },
        {
            slug: 'deep-relaxation-tide', title: 'Slow Tide Pad', category: 'Deep Relaxation', duration: 150,
            description: 'Slowly evolving warm chords that rise and fall like a calm tide.',
            build(ctx, { dry, wet, dur }) {
                const chords = [[130.81, 196, 246.94, 329.63], [110, 164.81, 196, 261.63], [87.31, 130.81, 164.81, 220], [98, 146.83, 164.81, 246.94]];
                const len = 16;
                for (let t = 0, i = 0; t < dur; t += len, i++) {
                    chords[i % 4].forEach((f, v) => pad(ctx, v % 2 ? wet : dry, { freq: f, start: Math.max(0, t - 4), end: Math.min(dur, t + len + 4), type: 'sawtooth', gain: 0.018, attack: 6, release: 6, cutoff: 700, lfo: 0.07, pan: v % 2 ? 0.4 : -0.4 }));
                }
            },
        },
        {
            slug: 'sleep-night-drift', title: 'Night Drift', category: 'Sleep Music', duration: 180,
            description: 'A low, soft drone with sparse distant notes that slowly fade – for winding down before sleep.',
            build(ctx, { dry, wet, dur, rand }) {
                for (const [f, pan] of [[87.31, -0.2], [130.81, 0.2]]) pad(ctx, dry, { freq: f, start: 0, end: dur, gain: 0.05, attack: 10, release: 12, cutoff: 400, lfo: 0.02, pan });
                const scale = [349.23, 392, 440, 523.25, 587.33];
                for (let t = 6; t < dur - 12; t += 7 + rand() * 4) {
                    const fade = t > dur - 60 ? 0.5 : 1;
                    note(ctx, wet, { freq: scale[Math.floor(rand() * scale.length)], at: t, gain: 0.05 * fade, attack: 1.4, decay: 6, pan: rand() * 1.2 - 0.6 });
                }
            },
        },
        {
            slug: 'stress-relief-warm-release', title: 'Warm Release', category: 'Stress Relief', duration: 150,
            description: 'A warm, open chord with a gentle, unhurried arpeggio to help your shoulders drop.',
            build(ctx, { dry, wet, dur }) {
                for (const [f, pan] of [[146.83, -0.3], [220, 0.3], [329.63, -0.1], [369.99, 0.1]]) pad(ctx, dry, { freq: f, start: 0, end: dur, type: 'triangle', gain: 0.022, attack: 6, release: 8, cutoff: 1200, lfo: 0.05, pan });
                const arp = [293.66, 369.99, 440, 659.25, 440, 369.99];
                for (let t = 4, i = 0; t < dur - 6; t += 1.0, i++) note(ctx, wet, { freq: arp[i % arp.length], at: t, gain: 0.035, decay: 1.6, type: 'triangle', cutoff: 2000, pan: (i % 2) ? 0.35 : -0.35 });
            },
        },
        {
            slug: 'breathing-guide-4-6', title: 'Breathing Guide 4·6', category: 'Breathing Meditation', duration: 180,
            description: 'Breathe in while the sound rises (4 seconds) and out while it falls (6 seconds). A soft chime marks each new breath.',
            breathing: { inhale: 4, exhale: 6 },
            build(ctx, { dry, wet, dur, rand }) {
                pad(ctx, dry, { freq: 110, start: 0, end: dur, gain: 0.03, attack: 4, release: 6, cutoff: 500, lfo: 0.02 });
                const breath = noiseSource(ctx, 'pink', rand);
                const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6;
                const bg = ctx.createGain(); bg.gain.value = 0;
                breath.connect(bp).connect(bg).connect(dry); breath.start(0); breath.stop(dur);
                const tone = ctx.createOscillator(); tone.frequency.value = 220;
                const tg = ctx.createGain(); tg.gain.value = 0;
                tone.connect(tg).connect(wet); tone.start(0); tone.stop(dur);
                for (let t = 1; t + 10 <= dur; t += 10) {
                    note(ctx, wet, { freq: 880, at: t, gain: 0.04, decay: 2.5 });
                    bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1100, t + 4); bp.frequency.linearRampToValueAtTime(400, t + 10);
                    bg.gain.setValueAtTime(0.0, t); bg.gain.linearRampToValueAtTime(0.28, t + 4); bg.gain.linearRampToValueAtTime(0.0, t + 10);
                    tone.frequency.setValueAtTime(220, t); tone.frequency.linearRampToValueAtTime(246.94, t + 4); tone.frequency.linearRampToValueAtTime(220, t + 10);
                    tg.gain.setValueAtTime(0.0, t); tg.gain.linearRampToValueAtTime(0.07, t + 4); tg.gain.linearRampToValueAtTime(0.0, t + 10);
                }
            },
        },
        {
            slug: 'mindfulness-singing-bowls', title: 'Singing Bowl Awareness', category: 'Mindfulness', duration: 150,
            description: 'Quiet room tone with a singing bowl every 20 seconds – each bowl is a cue to return to the present moment.',
            guide: [[0, 'Each bowl is a cue: notice your breath, then return gently to this moment.']],
            build(ctx, { dry, wet, dur, rand }) {
                const room = noiseSource(ctx, 'pink', rand);
                const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
                const g = ctx.createGain(); g.gain.value = 0.025;
                room.connect(lp).connect(g).connect(dry); room.start(0); room.stop(dur);
                const pitches = [146.83, 174.61, 220];
                for (let t = 1, i = 0; t < dur - 10; t += 20, i++) bowl(ctx, wet, { freq: pitches[i % 3], at: t, gain: 0.18, pan: rand() * 0.6 - 0.3 });
            },
        },
        {
            slug: 'focus-steady-brown-noise', title: 'Steady Focus', category: 'Focus and Concentration', duration: 120,
            description: 'Even brown noise with a faint steady tone and no melody – masks distractions while you study or work. Loop it for longer sessions.',
            build(ctx, { dry, dur, rand }) {
                const n = noiseSource(ctx, 'brown', rand);
                const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
                const g = ctx.createGain(); g.gain.value = 0.32;
                n.connect(lp).connect(g).connect(dry); n.start(0); n.stop(dur);
                for (const [f, pan] of [[110, -0.2], [164.81, 0.2]]) pad(ctx, dry, { freq: f, start: 0, end: dur, gain: 0.018, attack: 5, release: 5, cutoff: 500, lfo: 0.01, pan });
            },
        },
        {
            slug: 'nature-gentle-rain', title: 'Gentle Rain', category: 'Nature Sounds', duration: 120,
            description: 'Soft synthetic rain: a steady shower with scattered drops. Loop it for longer listening.',
            build(ctx, { dry, dur, rand }) {
                const bed = noiseSource(ctx, 'pink', rand);
                const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
                const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
                const g = ctx.createGain(); g.gain.value = 0.22;
                bed.connect(hp).connect(lp).connect(g).connect(dry); bed.start(0); bed.stop(dur);
                const drop = noiseBuffer(ctx, 'white', 0.04, rand);
                for (let t = 0.5; t < dur - 0.5; t += 0.03 + rand() * 0.12) {
                    const s = ctx.createBufferSource(); s.buffer = drop;
                    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + rand() * 4500; bp.Q.value = 4;
                    const dg = ctx.createGain(); dg.gain.setValueAtTime(0.05 + rand() * 0.12, t); dg.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
                    const p = ctx.createStereoPanner(); p.pan.value = rand() * 2 - 1;
                    s.connect(bp).connect(dg).connect(p).connect(dry); s.start(t); s.stop(t + 0.04);
                }
            },
        },
        {
            slug: 'nature-ocean-waves', title: 'Ocean Waves', category: 'Nature Sounds', duration: 120,
            description: 'Slow synthetic waves rolling in and out every 8–12 seconds. Loop it for longer listening.',
            build(ctx, { dry, dur, rand }) {
                for (const [pan, offset] of [[-0.5, 0], [0.5, 4.5]]) {
                    const n = noiseSource(ctx, 'pink', rand);
                    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
                    const g = ctx.createGain(); g.gain.value = 0.02;
                    const p = ctx.createStereoPanner(); p.pan.value = pan;
                    n.connect(lp).connect(g).connect(p).connect(dry); n.start(0); n.stop(dur);
                    for (let t = offset; t < dur; ) {
                        const len = 8 + rand() * 4, peak = 0.3 + rand() * 0.2;
                        g.gain.setValueAtTime(0.03, t); g.gain.linearRampToValueAtTime(peak, t + len * 0.35); g.gain.linearRampToValueAtTime(0.03, t + len);
                        lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1600, t + len * 0.35); lp.frequency.linearRampToValueAtTime(300, t + len);
                        t += len;
                    }
                }
            },
        },
    ];

    async function render(track) {
        const rand = mulberry32([...track.slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
        const dur = track.duration;
        const ctx = new OfflineAudioContext(2, SR * dur, SR);
        const master = ctx.createGain();
        master.gain.setValueAtTime(0, 0);
        master.gain.linearRampToValueAtTime(1, 3);
        master.gain.setValueAtTime(1, dur - 5);
        master.gain.linearRampToValueAtTime(0, dur - 0.05);
        master.connect(ctx.destination);
        const dry = ctx.createGain();
        dry.connect(master);
        const wet = ctx.createGain();
        const rv = reverb(ctx, 4.5, rand);
        const rvGain = ctx.createGain(); rvGain.gain.value = 0.55;
        wet.connect(dry);
        wet.connect(rv).connect(rvGain).connect(master);
        track.build(ctx, { dry, wet, dur, rand, track });
        const buf = await ctx.startRendering();
        // Loudness: target RMS ≈ -20 dBFS, peak ≤ -1.5 dBFS
        let sum = 0, peak = 0;
        for (let ch = 0; ch < 2; ch++) for (const v of buf.getChannelData(ch)) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
        const rms = Math.sqrt(sum / (buf.length * 2));
        const gain = Math.min(0.1 / (rms || 1), 0.84 / (peak || 1));
        for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= gain; }
        return buf;
    }

    async function encodeAac(buf) {
        const parts = [];
        let error = null;
        const enc = new AudioEncoder({ output: (c) => { const u = new Uint8Array(c.byteLength); c.copyTo(u); parts.push(u); }, error: (e) => { error = e; } });
        enc.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 96000, aac: { format: 'adts' } });
        const L = buf.getChannelData(0), R = buf.getChannelData(1), N = 8192;
        for (let i = 0; i < buf.length; i += N) {
            const n = Math.min(N, buf.length - i);
            const planar = new Float32Array(n * 2);
            planar.set(L.subarray(i, i + n), 0);
            planar.set(R.subarray(i, i + n), n);
            enc.encode(new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data: planar }));
        }
        await enc.flush();
        if (error) throw error;
        const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.length; }
        return out;
    }

    async function renderAndEncode(slug) {
        const track = TRACKS.find((t) => t.slug === slug);
        const buf = await render(track);
        const aac = await encodeAac(buf);
        // Verify: the encoded file must decode back to (about) the intended length
        const decoded = await new AudioContext().decodeAudioData(aac.buffer.slice(0));
        let binary = '';
        for (let i = 0; i < aac.length; i += 0x8000) binary += String.fromCharCode.apply(null, aac.subarray(i, i + 0x8000));
        return { slug, bytes: aac.length, decodedSeconds: decoded.duration, base64: btoa(binary) };
    }

    window.LuminaSynth = {
        TRACKS: TRACKS.map(({ build, ...meta }) => meta),
        renderAndEncode,
    };
})();
