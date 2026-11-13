// The page's static markup: controls, panel frames, captions and the filter
// notes, exactly as in the original standalone page. main.js mounts it into
// #root before wiring it, so if the script fails the page stays visibly blank
// (which is what the render sweep checks for).
//
// The back link is "../", not "./index.html": the hub mounts this page one
// level under its section (/audio/learn/crossover-scope/), so "../" is the
// section, and locally it is the dev landing page. The hub currently turns a
// tool's "./index.html" into a redirect to the tool itself, not its section.
export default String.raw`
<div class="wrap">
  <nav class="back"><a href="../">&larr; back to the list</a></nav>
  <header>
    <h1>Crossover Scope <span>LP + HP = ?</span></h1>
    <p>Pick a filter family and order, then watch the same split from four angles: level, delay, phasors and the waveform itself. All four views share one probe frequency.</p>
  </header>

  <div class="app">
    <aside class="rail" aria-label="Controls">
      <div class="group">
        <div class="label">Filter family</div>
        <div class="seg" id="typeSeg">
          <button type="button" data-type="BW">Butterworth</button>
          <button type="button" data-type="LR">Linkwitz-Riley</button>
          <button type="button" data-type="BE">Bessel</button>
          <button type="button" data-type="LIN">Linear-phase</button>
        </div>
      </div>
      <div class="group">
        <div class="label">Order <span class="val" id="slopeVal"></span></div>
        <div class="seg mono" id="orderSeg"></div>
      </div>
      <div class="group">
        <label class="label" for="fc">Crossover fc <output id="fcVal"></output></label>
        <input type="range" id="fc" min="0" max="1000" step="1">
      </div>
      <div class="group">
        <label class="label" for="fsel">Probe / test frequency <output id="fselVal"></output></label>
        <input type="range" id="fsel" min="0" max="1000" step="1">
        <p class="sub">You can also drag across the level or delay chart.</p>
      </div>
      <div class="divider"></div>
      <div class="group">
        <div class="label">Test signal</div>
        <div class="seg" id="sigSeg">
          <button type="button" data-sig="burst">Tone burst</button>
          <button type="button" data-sig="square">Square wave</button>
          <button type="button" data-sig="step">Step</button>
        </div>
        <div class="group" id="cycGroup">
          <div class="label">Burst length</div>
          <div class="seg mono" id="cycSeg">
            <button type="button" data-cyc="1">1</button>
            <button type="button" data-cyc="2">2</button>
            <button type="button" data-cyc="4">4</button>
            <button type="button" data-cyc="8">8</button>
          </div>
          <p class="sub">Cycles, Hann-windowed.</p>
        </div>
      </div>
      <div class="divider"></div>
      <div class="group">
        <div class="label">Alignment</div>
        <label class="check"><input type="checkbox" id="inv"> Invert high-pass polarity</label>
      </div>
      <div class="group">
        <label class="label" for="dLP">Low-pass path delay <output id="dLPVal"></output></label>
        <input type="range" id="dLP" min="0" max="20" step="0.1">
      </div>
      <div class="group">
        <label class="label" for="dHP">High-pass path delay <output id="dHPVal"></output></label>
        <input type="range" id="dHP" min="0" max="20" step="0.1">
        <p class="sub">A tapped horn's folded path acts like extra low-pass delay. Delaying the high-pass by the same amount re-aligns them.</p>
      </div>
      <div class="divider"></div>
      <div class="group">
        <div class="label">Show traces</div>
        <div class="traces">
          <label class="check"><input type="checkbox" id="sLP" checked><span class="sw lp"></span>Low-pass</label>
          <label class="check"><input type="checkbox" id="sHP" checked><span class="sw hp"></span>High-pass</label>
          <label class="check"><input type="checkbox" id="sSum" checked><span class="sw sum"></span>Sum</label>
          <label class="check"><input type="checkbox" id="sIn" checked><span class="sw in"></span>Input</label>
        </div>
      </div>
      <div class="divider"></div>
      <div class="group">
        <div class="label">Try these</div>
        <div class="presets" id="presets"></div>
      </div>
    </aside>

    <main class="plots">
      <section class="panel wide">
        <div class="ph"><h2>Level</h2>
          <div class="keys"><span><span class="sw lp"></span> LP</span><span><span class="sw hp"></span> HP</span><span><span class="sw sum"></span> LP + HP</span></div>
        </div>
        <canvas id="cMag" aria-label="Magnitude response of low-pass, high-pass and their sum"></canvas>
        <p class="cap">Each curve is <code>20·log₁₀|H(f)|</code>. The sum is the <em>complex</em> sum <code>H_LP + H_HP</code>, so it depends on phase as well as level. Linkwitz-Riley puts both sides at −6 dB (amplitude 0.5) at fc, in phase, so 0.5 + 0.5 = 1.0 and the sum is flat.</p>
      </section>

      <section class="panel">
        <div class="ph"><h2 id="gdTitle">Group delay</h2>
          <div class="seg" id="gdSeg">
            <button type="button" data-gd="gd">Group delay</button>
            <button type="button" data-gd="ph">Phase</button>
          </div>
        </div>
        <canvas id="cGd" aria-label="Group delay or phase of the outputs"></canvas>
        <p class="cap" id="gdCap"></p>
      </section>

      <section class="panel">
        <div class="ph"><h2>Phasors at the probe</h2>
          <button type="button" class="btn" id="spinBtn">Pause</button>
        </div>
        <canvas id="cPh" aria-label="Phasor diagram at the probe frequency"></canvas>
        <p class="cap">Each output is an arrow: length is amplitude, angle is phase. The high-pass arrow starts where the low-pass arrow ends, so the dark arrow from the centre is what you hear. On the right, the same arrows unrolled into the steady-state sine waves: vertical height of each arrow traced over time.</p>
      </section>

      <section class="panel wide">
        <div class="ph"><h2>Waveform</h2>
          <div class="keys"><span><span class="sw in"></span> input</span><span><span class="sw lp"></span> LP out</span><span><span class="sw hp"></span> HP out</span><span><span class="sw sum"></span> LP + HP</span></div>
        </div>
        <canvas id="cWave" aria-label="Time-domain waveforms"></canvas>
        <p class="cap" id="waveCap"></p>
      </section>

      <section class="panel wide readout">
        <div class="ph"><h2 id="roTitle">At the probe frequency</h2></div>
        <div style="overflow-x:auto">
          <table class="rtab">
            <thead><tr><th></th><th>Low-pass</th><th>High-pass</th><th>LP + HP</th></tr></thead>
            <tbody>
              <tr><td>Level</td><td class="c-lp" id="rLPdb"></td><td class="c-hp" id="rHPdb"></td><td class="c-sum" id="rSdb"></td></tr>
              <tr><td>Amplitude (arrow length)</td><td class="c-lp" id="rLPa"></td><td class="c-hp" id="rHPa"></td><td class="c-sum" id="rSa"></td></tr>
              <tr><td>Phase</td><td class="c-lp" id="rLPp"></td><td class="c-hp" id="rHPp"></td><td class="c-sum" id="rSp"></td></tr>
              <tr><td>Group delay</td><td class="c-lp" id="rLPg"></td><td class="c-hp" id="rHPg"></td><td class="c-sum" id="rSg"></td></tr>
            </tbody>
          </table>
        </div>
        <p class="hint" id="hint1"></p>
        <p class="hint" id="hint2" hidden></p>
      </section>
    </main>
  </div>

  <section class="notes" aria-label="Filter math">
    <div class="note"><h3>Butterworth</h3>
      <div class="eq">|H_LP|² = 1 / (1 + (f/fc)^(2n))</div>
      <p>Flattest possible passband for its order. Each side is −3 dB (amplitude 0.707) at fc. Odd orders sit 90° apart there and add flat in power. Even orders sit 180° apart and give a +3 dB bump once one side is inverted.</p></div>
    <div class="note"><h3>Linkwitz-Riley</h3>
      <div class="eq">H_LR(2k) = (H_BW(k))²</div>
      <p>Two Butterworths in series. Each side is −6 dB at fc and the two are in phase, so the voltage sum is flat. The sum is an all-pass: level stays flat while phase turns through order × 90°, which is the group delay bump you see.</p></div>
    <div class="note"><h3>Bessel</h3>
      <div class="eq">H(s) = θₙ(0) / θₙ(s)</div>
      <p>θₙ is the reverse Bessel polynomial, chosen for the flattest group delay. That gives the least ringing but the gentlest knee, so it suppresses less just above fc and the sum is not flat. Scaled here so −3 dB lands on fc.</p></div>
    <div class="note"><h3>Linear-phase (FIR)</h3>
      <div class="eq">H_HP = 1 − H_LP,  ∠H = 0</div>
      <p>Same level shape as LR, no phase rotation, so the sum is exactly the input. Shown zero-phase here. A real FIR must delay everything by half its length (about 50 ms for useful bass resolution), and its symmetric impulse rings before an event as well as after.</p></div>
  </section>
</div>
`;
