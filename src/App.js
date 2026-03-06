import { useState, useRef } from "react";

const DESIGN_TYPES = [
  { id: "landing_page", label: "Landing Page", icon: "🖥️" },
  { id: "social_media", label: "Social Media Post", icon: "📱" },
  { id: "design_system", label: "Design System", icon: "🎨" },
  { id: "mobile_app", label: "Mobile App", icon: "📲" },
  { id: "banner_ad", label: "Banner / Ad", icon: "📣" },
  { id: "other", label: "Other", icon: "✏️" },
];

const getSystemPrompt = (designType) => `You are an expert UI/UX design reviewer with deep knowledge in visual design, user experience, accessibility, and design systems.
The design type is: ${designType}
Analyze the design provided (image or PDF) and return ONLY valid JSON, no markdown, no backticks, no explanation.
{
  "overall_score": <1-10>,
  "summary": "<2-3 sentence overall impression>",
  "strengths": [{ "point": "<title>", "detail": "<why it works>" }],
  "issues": [{ "severity": "<critical|major|minor>", "area": "<area>", "problem": "<issue>", "fix": "<fix>" }],
  "improvements": [{ "area": "<area>", "suggestion": "<idea>" }],
  "accessibility": { "score": <1-10>, "notes": "<observations>" },
  "scores": { "visual_hierarchy": <1-10>, "color_contrast": <1-10>, "typography": <1-10>, "layout_spacing": <1-10>, "consistency": <1-10> }
}`;

const sevColor = { critical: "#EF4444", major: "#F59E0B", minor: "#6B7280" };
const sevBg = { critical: "#FEF2F2", major: "#FFFBEB", minor: "#F9FAFB" };

function ScoreBar({ label, value }) {
  const c = value >= 8 ? "#10B981" : value >= 6 ? "#F59E0B" : "#EF4444";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "#374151", fontWeight: 500 }}>{label}</span>
        <span style={{ color: c, fontWeight: 700 }}>{value}/10</span>
      </div>
      <div style={{ background: "#E5E7EB", borderRadius: 99, height: 6 }}>
        <div style={{ width: `${value * 10}%`, background: c, borderRadius: 99, height: 6, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function ScoreCircle({ score }) {
  const c = score >= 8 ? "#10B981" : score >= 6 ? "#F59E0B" : "#EF4444";
  const r = 36, circ = 2 * Math.PI * r, pct = (score / 10) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E5E7EB" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={c} strokeWidth="8"
          strokeDasharray={`${pct} ${circ}`} strokeLinecap="round" transform="rotate(-90 50 50)" />
        <text x="50" y="45" textAnchor="middle" fill={c} fontSize="22" fontWeight="800">{score}</text>
        <text x="50" y="62" textAnchor="middle" fill="#9CA3AF" fontSize="11">/10</text>
      </svg>
      <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 600, marginTop: -4 }}>Overall</span>
    </div>
  );
}

const MODES = [
  { id: "upload", label: "🖼️ Image" },
  { id: "pdf", label: "📄 PDF" },
  { id: "figma", label: "🔗 Figma" },
];

export default function App() {
  const [step, setStep] = useState(1);
  const [designType, setDesignType] = useState(null);
  const [inputMode, setInputMode] = useState("upload");
  const [fileBase64, setFileBase64] = useState(null);
  const [fileMediaType, setFileMediaType] = useState("image/png");
  const [fileType, setFileType] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [figmaUrl, setFigmaUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const clearFile = () => {
    setFileBase64(null); setFileMediaType("image/png");
    setFileType(null); setImagePreview(null); setFileName("");
  };

  const handleFile = (file) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf";
    if (!isImage && !isPDF) { setError("Please upload an image (PNG, JPG, WebP) or a PDF file."); return; }
    setError("");
    setFileName(file.name);
    setFileMediaType(file.type);
    setFileType(isPDF ? "pdf" : "image");
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setFileBase64(dataUrl.split(",")[1]);
      if (isImage) setImagePreview(dataUrl);
      else setImagePreview(null);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };

  const analyze = async () => {
    if (!fileBase64) { setError("Please upload a file first."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const contentBlock = fileType === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
        : { type: "image", source: { type: "base64", media_type: fileMediaType, data: fileBase64 } };

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.REACT_APP_ANTHROPIC_API_KEY,  // ← from .env
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",    // ← required for browser calls
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: getSystemPrompt(DESIGN_TYPES.find(d => d.id === designType)?.label || designType),
          messages: [{
            role: "user",
            content: [
              contentBlock,
              { type: "text", text: "Review this design thoroughly and return JSON only." }
            ]
          }]
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResult(parsed);
      setStep(3);
    } catch (e) {
      setError(e.message || "Analysis failed. Please try again.");
    }
    setLoading(false);
  };

  const reset = () => {
    setStep(1); setDesignType(null); clearFile();
    setResult(null); setError(""); setFigmaUrl(""); setInputMode("upload");
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: "#F8F8FC", minHeight: "100vh", padding: "32px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#6C63FF", color: "#fff", borderRadius: 20, padding: "6px 18px", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>✦ AI Design Review</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1E1B4B", margin: "0 0 6px" }}>Design Review Tool</h1>
          <p style={{ color: "#6B7280", fontSize: 14, margin: 0 }}>Instant AI-powered feedback on your designs</p>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 32 }}>
          {["Choose Type", "Add Design", "Results"].map((label, i) => {
            const s = i + 1, active = step === s, done = step > s;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: done || active ? "#6C63FF" : "#E5E7EB", color: done || active ? "#fff" : "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                    {done ? "✓" : s}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active || done ? "#6C63FF" : "#9CA3AF" }}>{label}</span>
                </div>
                {i < 2 && <div style={{ width: 32, height: 2, background: done ? "#6C63FF" : "#E5E7EB", borderRadius: 2 }} />}
              </div>
            );
          })}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 2px 12px #0000000a" }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1E1B4B", margin: "0 0 6px" }}>What type of design is this?</h2>
            <p style={{ color: "#9CA3AF", fontSize: 13, margin: "0 0 20px" }}>Tailors the review criteria to your design</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {DESIGN_TYPES.map(dt => (
                <div key={dt.id} onClick={() => setDesignType(dt.id)}
                  style={{ border: `2px solid ${designType === dt.id ? "#6C63FF" : "#E5E7EB"}`, background: designType === dt.id ? "#F0EFFE" : "#fff", borderRadius: 14, padding: "16px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s" }}>
                  <span style={{ fontSize: 22 }}>{dt.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: designType === dt.id ? "#6C63FF" : "#374151" }}>{dt.label}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(2)} disabled={!designType}
              style={{ marginTop: 24, width: "100%", background: designType ? "#6C63FF" : "#E5E7EB", color: designType ? "#fff" : "#9CA3AF", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: designType ? "pointer" : "not-allowed" }}>
              Continue →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 2px 12px #0000000a" }}>
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "#6C63FF", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 20 }}>← Back</button>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1E1B4B", margin: "0 0 16px" }}>Add your design</h2>

            <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 12, padding: 4, marginBottom: 24, gap: 4 }}>
              {MODES.map(m => (
                <button key={m.id} onClick={() => { setInputMode(m.id); clearFile(); setError(""); }}
                  style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: "none", background: inputMode === m.id ? "#fff" : "transparent", color: inputMode === m.id ? "#6C63FF" : "#6B7280", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: inputMode === m.id ? "0 1px 4px #0000001a" : "none", transition: "all 0.15s" }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* IMAGE */}
            {inputMode === "upload" && (
              !fileBase64 ? (
                <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
                  onClick={() => fileRef.current.click()}
                  style={{ border: `2px dashed ${dragging ? "#6C63FF" : "#D1D5DB"}`, background: dragging ? "#F0EFFE" : "#F9FAFB", borderRadius: 16, padding: "48px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#1E1B4B", marginBottom: 6 }}>Drop your design image here</div>
                  <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>PNG, JPG, WebP supported</div>
                  <span style={{ background: "#6C63FF", color: "#fff", borderRadius: 10, padding: "8px 20px", fontSize: 13, fontWeight: 600 }}>Choose Image</span>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
                </div>
              ) : (
                <div>
                  <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB", background: "#F8F8FC", maxHeight: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={imagePreview} alt="preview" style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain" }} />
                  </div>
                  <button onClick={clearFile} style={{ marginTop: 10, background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#6B7280", cursor: "pointer" }}>✕ Remove</button>
                </div>
              )
            )}

            {/* PDF */}
            {inputMode === "pdf" && (
              <div>
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#1E40AF" }}>
                  📄 Upload your design as a PDF — exported from Figma, Sketch, Adobe XD, or any design tool. Multi-page PDFs are fully supported.
                </div>
                {!fileBase64 ? (
                  <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
                    onClick={() => fileRef.current.click()}
                    style={{ border: `2px dashed ${dragging ? "#6C63FF" : "#D1D5DB"}`, background: dragging ? "#F0EFFE" : "#F9FAFB", borderRadius: 16, padding: "48px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.2s" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1E1B4B", marginBottom: 6 }}>Drop your PDF design here</div>
                    <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>PDF files up to 32MB supported</div>
                    <span style={{ background: "#6C63FF", color: "#fff", borderRadius: 10, padding: "8px 20px", fontSize: 13, fontWeight: 600 }}>Choose PDF</span>
                    <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
                  </div>
                ) : (
                  <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 14, padding: "20px", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 36 }}>📄</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#065F46" }}>{fileName}</div>
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>PDF ready for analysis</div>
                    </div>
                    <button onClick={clearFile} style={{ background: "none", border: "1px solid #D1D5DB", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer" }}>✕ Remove</button>
                  </div>
                )}
              </div>
            )}

            {/* FIGMA */}
            {inputMode === "figma" && (
              <div>
                <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E", marginBottom: 8 }}>📋 How to export from Figma</div>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#78350F", lineHeight: 2 }}>
                    <li>Select the frame you want reviewed in Figma</li>
                    <li>Go to <strong>Export</strong> panel (bottom right) → choose <strong>PDF</strong> or <strong>PNG</strong></li>
                    <li>Click <strong>Export</strong> and save the file</li>
                    <li>Upload it using the <strong>PDF</strong> or <strong>Image</strong> tab above</li>
                  </ol>
                </div>
                <input value={figmaUrl} onChange={e => setFigmaUrl(e.target.value)}
                  placeholder="https://www.figma.com/design/..."
                  style={{ width: "100%", border: "2px solid #E5E7EB", borderRadius: 12, padding: "13px 16px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: "#374151" }}
                  onFocus={e => e.target.style.borderColor = "#6C63FF"}
                  onBlur={e => e.target.style.borderColor = "#E5E7EB"}
                />
                <div style={{ marginTop: 10, background: "#F3F4F6", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>
                  ℹ️ Figma links can't be loaded directly due to browser security. Export your design as PDF or PNG and upload using the tabs above.
                </div>
              </div>
            )}

            {error && <div style={{ marginTop: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>⚠️ {error}</div>}

            {inputMode !== "figma" && (
              <button onClick={analyze} disabled={!fileBase64 || loading}
                style={{ marginTop: 20, width: "100%", background: fileBase64 && !loading ? "#6C63FF" : "#E5E7EB", color: fileBase64 && !loading ? "#fff" : "#9CA3AF", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: fileBase64 && !loading ? "pointer" : "not-allowed" }}>
                {loading ? "Analyzing... ✦" : "Analyze Design →"}
              </button>
            )}

            {loading && (
              <div style={{ marginTop: 16, background: "#F0EFFE", borderRadius: 12, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#6C63FF", fontWeight: 600 }}>🔍 Reviewing hierarchy, colors, typography, layout...</div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#1E1B4B", borderRadius: 20, padding: "24px 28px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <ScoreCircle score={result.overall_score} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: "#A5B4FC", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  {DESIGN_TYPES.find(d => d.id === designType)?.icon} {DESIGN_TYPES.find(d => d.id === designType)?.label} Review
                </div>
                <p style={{ color: "#E2E8F0", fontSize: 14, margin: 0, lineHeight: 1.6 }}>{result.summary}</p>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px #0000000a" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 16px" }}>Category Scores</h3>
              <ScoreBar label="Visual Hierarchy" value={result.scores.visual_hierarchy} />
              <ScoreBar label="Color & Contrast" value={result.scores.color_contrast} />
              <ScoreBar label="Typography" value={result.scores.typography} />
              <ScoreBar label="Layout & Spacing" value={result.scores.layout_spacing} />
              <ScoreBar label="Consistency" value={result.scores.consistency} />
            </div>

            <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px #0000000a" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 14px" }}>✅ Strengths</h3>
              {result.strengths.map((s, i) => (
                <div key={i} style={{ background: "#F0FDF4", borderRadius: 12, padding: "12px 14px", borderLeft: "3px solid #10B981", marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#065F46" }}>{s.point}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{s.detail}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px #0000000a" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 14px" }}>⚠️ Issues Found</h3>
              {result.issues.map((issue, i) => (
                <div key={i} style={{ background: sevBg[issue.severity], borderRadius: 12, padding: "12px 14px", borderLeft: `3px solid ${sevColor[issue.severity]}`, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ background: sevColor[issue.severity], color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 7px" }}>{issue.severity.toUpperCase()}</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#1E1B4B" }}>{issue.area}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#374151" }}>{issue.problem}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>💡 {issue.fix}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px #0000000a" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 14px" }}>🚀 Improvements</h3>
              {result.improvements.map((imp, i) => (
                <div key={i} style={{ background: "#F0EFFE", borderRadius: 12, padding: "12px 14px", borderLeft: "3px solid #6C63FF", marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#4C1D95" }}>{imp.area}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{imp.suggestion}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px #0000000a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: 0 }}>♿ Accessibility</h3>
                <span style={{ background: result.accessibility.score >= 8 ? "#D1FAE5" : "#FEF3C7", color: result.accessibility.score >= 8 ? "#065F46" : "#92400E", fontWeight: 700, fontSize: 13, borderRadius: 8, padding: "3px 10px" }}>
                  {result.accessibility.score}/10
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>{result.accessibility.notes}</p>
            </div>

            <button onClick={reset} style={{ background: "#6C63FF", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }}>
              + Review Another Design
            </button>
          </div>
        )}
      </div>
    </div>
  );
}