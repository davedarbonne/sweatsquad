import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

const BADGE_DEFS = [
  { id: "first_blood", emoji: "🔥", label: "First Rep", desc: "Log your first entry" },
  { id: "streak3", emoji: "⚡", label: "On Fire", desc: "Log 3 days in a row" },
  { id: "finisher", emoji: "🏆", label: "Finisher", desc: "Complete a challenge" },
  { id: "podium", emoji: "🥇", label: "Top Dog", desc: "Reach #1 on the leaderboard" },
  { id: "centurion", emoji: "💯", label: "Centurion", desc: "Log 100 total reps/mins/steps" },
];

const CHALLENGE_TEMPLATES = [
  { name: "30-Day Pushup Challenge", unit: "pushups", goal: 1000, emoji: "💪" },
  { name: "10K Steps Daily", unit: "steps", goal: 300000, emoji: "👟" },
  { name: "Run 50 Miles", unit: "miles", goal: 50, emoji: "🏃" },
  { name: "100 Min Plank Month", unit: "seconds", goal: 6000, emoji: "🧘" },
  { name: "Burpee Blitz", unit: "burpees", goal: 500, emoji: "🔥" },
];

function Avatar({ name, size = 36 }) {
  const colors = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63"];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: colors[idx],
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.4, color: "#fff", flexShrink: 0,
      fontFamily: "'Bebas Neue', cursive", letterSpacing: 1
    }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

function BadgeChip({ badge }) {
  return (
    <div title={badge.desc} style={{
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 20, padding: "3px 10px", fontSize: 13, display: "flex",
      alignItems: "center", gap: 4, cursor: "default"
    }}>
      <span>{badge.emoji}</span>
      <span style={{ color: "#ccc", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{badge.label}</span>
    </div>
  );
}

function ProgressBar({ pct, color = "#f97316" }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 8, overflow: "hidden", width: "100%" }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 99,
        background: `linear-gradient(90deg, ${color}, #fbbf24)`,
        transition: "width 0.6s cubic-bezier(.4,0,.2,1)"
      }} />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, color: "#666", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 12 }}>
      {children}
    </div>
  );
}

const FIRESTORE_DOC = "sweatsquad/challenges";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [userName, setUserName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [logAmount, setLogAmount] = useState("");
  const [newChallenge, setNewChallenge] = useState({ name: "", unit: "", goal: "", emoji: "💪" });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newBadges, setNewBadges] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Load username from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sweatsquad_username");
    if (saved) setUserName(saved);
  }, []);

  // Real-time listener for challenges from Firestore
  useEffect(() => {
    const ref = doc(db, "sweatsquad", "challenges");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setChallenges(snap.data().list || []);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Update selectedChallenge in real-time when challenges change
  useEffect(() => {
    if (selectedChallenge) {
      const updated = challenges.find(c => c.id === selectedChallenge.id);
      if (updated) setSelectedChallenge(updated);
    }
  }, [challenges]); // eslint-disable-line

  const save = async (updated) => {
    const ref = doc(db, "sweatsquad", "challenges");
    await setDoc(ref, { list: updated });
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSetName = () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    setUserName(name);
    localStorage.setItem("sweatsquad_username", name);
    setNameInput("");
  };

  const buildLeaderboard = (ch) => {
    const map = {};
    (ch.logs || []).forEach(l => {
      map[l.user] = (map[l.user] || 0) + l.amount;
    });
    return Object.entries(map)
      .map(([user, total]) => ({ user, total, pct: Math.min(100, (total / ch.goal) * 100) }))
      .sort((a, b) => b.total - a.total);
  };

  const getUserBadges = (user, allChallenges) => {
    const earned = new Set();
    let totalLogged = 0;
    let rank1 = false;
    let everFinished = false;

    allChallenges.forEach(ch => {
      const entries = (ch.logs || []).filter(l => l.user === user);
      const total = entries.reduce((a, l) => a + l.amount, 0);
      totalLogged += total;
      if (total >= ch.goal) everFinished = true;
      const leaderboard = buildLeaderboard(ch);
      if (leaderboard[0]?.user === user && leaderboard[0]?.total > 0) rank1 = true;
      const days = [...new Set(entries.map(l => l.date))].sort();
      let streak = 1;
      for (let i = 1; i < days.length; i++) {
        const diff = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
        streak = diff === 1 ? streak + 1 : 1;
        if (streak >= 3) { earned.add("streak3"); break; }
      }
      if (entries.length > 0) earned.add("first_blood");
    });

    if (everFinished) earned.add("finisher");
    if (rank1) earned.add("podium");
    if (totalLogged >= 100) earned.add("centurion");
    return BADGE_DEFS.filter(b => earned.has(b.id));
  };

  const getMyHistory = () => {
    const all = [];
    challenges.forEach(ch => {
      (ch.logs || [])
        .filter(l => l.user === userName)
        .forEach(l => all.push({ ...l, challengeName: ch.name, challengeEmoji: ch.emoji, unit: ch.unit, challengeId: ch.id }));
    });
    return all.sort((a, b) => b.ts - a.ts);
  };

  const handleLog = async () => {
    if (!userName) { showToast("Set your name first!", "error"); return; }
    const amt = parseFloat(logAmount);
    if (!amt || amt <= 0) { showToast("Enter a valid amount", "error"); return; }

    const today = new Date().toISOString().slice(0, 10);
    const entry = { user: userName, amount: amt, date: today, ts: Date.now() };

    const prevBadges = getUserBadges(userName, challenges);
    const updated = challenges.map(ch =>
      ch.id === selectedChallenge.id ? { ...ch, logs: [...(ch.logs || []), entry] } : ch
    );
    await save(updated);

    const newB = getUserBadges(userName, updated);
    const gained = newB.filter(b => !prevBadges.find(p => p.id === b.id));
    if (gained.length) { setNewBadges(gained); setTimeout(() => setNewBadges([]), 4000); }

    setLogAmount("");
    showToast(`+${amt} ${selectedChallenge.unit} logged! 💪`);
  };

  const handleCreateChallenge = async () => {
    if (!newChallenge.name || !newChallenge.unit || !newChallenge.goal) {
      showToast("Fill all fields", "error"); return;
    }
    const ch = {
      id: Date.now().toString(),
      name: newChallenge.name,
      unit: newChallenge.unit,
      goal: parseFloat(newChallenge.goal),
      emoji: newChallenge.emoji,
      createdBy: userName || "Anonymous",
      createdAt: Date.now(),
      logs: [],
    };
    await save([...challenges, ch]);
    setNewChallenge({ name: "", unit: "", goal: "", emoji: "💪" });
    setSelectedChallenge(null);
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Challenge created! 🎉");
  };

  const handleDeleteChallenge = async (id) => {
    const updated = challenges.filter(ch => ch.id !== id);
    await save(updated);
    setDeleteConfirm(null);
    if (screen === "challenge") { setScreen("home"); setSelectedChallenge(null); }
    showToast("Challenge deleted");
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatTs = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const navItems = [
    { label: "Challenges", icon: "🏋️", s: "home" },
    { label: "Create", icon: "➕", s: "create" },
    { label: "My Stats", icon: "📊", s: "profile" },
  ];

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 48 }}>🏋️</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", fontFamily: "'DM Sans', sans-serif", color: "#f0f0f0", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{ position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(249,115,22,0.15) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {newBadges.length > 0 && (
        <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #1a1a1f, #2a1a00)", border: "1.5px solid #f97316", borderRadius: 16, padding: "14px 24px", zIndex: 999, textAlign: "center", boxShadow: "0 0 40px rgba(249,115,22,0.4)" }}>
          <div style={{ fontSize: 11, color: "#f97316", fontFamily: "'Space Mono', monospace", letterSpacing: 2, marginBottom: 6 }}>NEW BADGE UNLOCKED</div>
          {newBadges.map(b => <div key={b.id} style={{ fontSize: 22 }}>{b.emoji} <span style={{ fontWeight: 700 }}>{b.label}</span></div>)}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.type === "error" ? "#f87171" : "#4ade80"}`, color: "#fff", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 600, zIndex: 998, whiteSpace: "nowrap" }}>{toast.msg}</div>
      )}

      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 990, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#1a1a1f", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 20, padding: 28, maxWidth: 340, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Delete this challenge?</div>
            <div style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>"{challenges.find(c => c.id === deleteConfirm)?.name}" and all its logs will be permanently removed.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 12, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Cancel</button>
              <button onClick={() => handleDeleteChallenge(deleteConfirm)} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: 12, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 90px", position: "relative", zIndex: 1 }}>

        <div style={{ paddingTop: 28, paddingBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 34, letterSpacing: 2, lineHeight: 1, color: "#fff" }}>SWEAT<span style={{ color: "#f97316" }}>SQUAD</span></div>
            <div style={{ fontSize: 12, color: "#666", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>CHALLENGE YOUR CREW</div>
          </div>
          {userName && <Avatar name={userName} size={42} />}
        </div>

        {!userName && (
          <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Who are you? 👋</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSetName()} placeholder="Your name..."
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
              <button onClick={handleSetName} style={{ background: "#f97316", border: "none", borderRadius: 10, padding: "10px 18px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Go</button>
            </div>
          </div>
        )}

        {screen === "challenge" && (
          <button onClick={() => { setScreen("home"); setSelectedChallenge(null); }} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "4px 0", marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
            ← Back
          </button>
        )}

        {/* HOME */}
        {screen === "home" && (
          <div>
            {userName && (() => {
              const badges = getUserBadges(userName, challenges);
              return badges.length > 0 ? (
                <div style={{ marginBottom: 20 }}>
                  <SectionLabel>YOUR BADGES</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{badges.map(b => <BadgeChip key={b.id} badge={b} />)}</div>
                </div>
              ) : null;
            })()}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SectionLabel>ACTIVE CHALLENGES</SectionLabel>
              <button onClick={() => setScreen("create")} style={{ background: "#f97316", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ New</button>
            </div>
            {challenges.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏋️</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No challenges yet</div>
                <div style={{ fontSize: 14 }}>Create the first one for your squad!</div>
              </div>
            )}
            {challenges.map(ch => {
              const lb = buildLeaderboard(ch);
              const myEntry = lb.find(e => e.user === userName);
              const myTotal = myEntry?.total || 0;
              const pct = Math.min(100, (myTotal / ch.goal) * 100);
              return (
                <div key={ch.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 18, marginBottom: 12, position: "relative" }}>
                  <button onClick={e => { e.stopPropagation(); setDeleteConfirm(ch.id); }} title="Delete challenge"
                    style={{ position: "absolute", top: 14, right: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ef4444", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>🗑</button>
                  <div onClick={() => { setSelectedChallenge(ch); setScreen("challenge"); }} style={{ cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, paddingRight: 36 }}>
                      <div style={{ fontSize: 28 }}>{ch.emoji}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{ch.name}</div>
                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Goal: {ch.goal.toLocaleString()} {ch.unit}</div>
                      </div>
                      <div style={{ marginLeft: "auto", fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#f97316", fontWeight: 700 }}>{Math.round(pct)}%</div>
                    </div>
                    <ProgressBar pct={pct} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "#666" }}>
                      <span>{lb.length} participant{lb.length !== 1 ? "s" : ""}</span>
                      <span>{lb[0] ? `🥇 ${lb[0].user}` : "No entries yet"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CHALLENGE DETAIL */}
        {screen === "challenge" && selectedChallenge && (() => {
          const ch = challenges.find(c => c.id === selectedChallenge.id) || selectedChallenge;
          const lb = buildLeaderboard(ch);
          const myEntry = lb.find(e => e.user === userName);
          const myTotal = myEntry?.total || 0;
          const myPct = Math.min(100, (myTotal / ch.goal) * 100);
          const completed = myTotal >= ch.goal;
          return (
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 52, marginBottom: 6 }}>{completed ? "🏆" : ch.emoji}</div>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 2 }}>{ch.name}</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Goal: {ch.goal.toLocaleString()} {ch.unit}</div>
                </div>
                <button onClick={() => setDeleteConfirm(ch.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "8px 10px", color: "#ef4444", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>🗑</button>
              </div>
              {!completed && (
                <div style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Log Your Progress</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" value={logAmount} onChange={e => setLogAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLog()} placeholder={`${ch.unit}...`}
                      style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
                    <button onClick={handleLog} style={{ background: "#f97316", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Log</button>
                  </div>
                </div>
              )}
              {completed && (
                <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 16, padding: 18, marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🎉</div>
                  <div style={{ fontWeight: 700, color: "#4ade80" }}>Challenge Complete!</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>You crushed it, {userName}!</div>
                </div>
              )}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>Your Progress</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "#f97316" }}>{myTotal.toLocaleString()} / {ch.goal.toLocaleString()}</div>
                </div>
                <ProgressBar pct={myPct} color={completed ? "#4ade80" : "#f97316"} />
              </div>
              <SectionLabel>LEADERBOARD</SectionLabel>
              {lb.length === 0 && <div style={{ color: "#555", fontSize: 14 }}>No entries yet. Be the first!</div>}
              {lb.map((entry, i) => (
                <div key={entry.user} style={{ display: "flex", alignItems: "center", gap: 12, background: entry.user === userName ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${entry.user === userName ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c32" : "#555", width: 24, textAlign: "center" }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </div>
                  <Avatar name={entry.user} size={34} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.user}{entry.user === userName ? " (you)" : ""}</div>
                    <div style={{ marginTop: 4 }}><ProgressBar pct={entry.pct} color={i === 0 ? "#fbbf24" : "#f97316"} /></div>
                  </div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#aaa", textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: "#fff" }}>{entry.total.toLocaleString()}</div>
                    <div style={{ fontSize: 10 }}>{ch.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* CREATE */}
        {screen === "create" && (
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 2, marginBottom: 20 }}>NEW CHALLENGE</div>
            <SectionLabel>QUICK START</SectionLabel>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
              {CHALLENGE_TEMPLATES.map(t => (
                <button key={t.name} onClick={() => setNewChallenge({ name: t.name, unit: t.unit, goal: t.goal, emoji: t.emoji })}
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 14px", color: "#fff", cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, flexShrink: 0 }}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Challenge Name", key: "name", placeholder: "e.g. 30-Day Pushup Challenge" },
                { label: "Unit", key: "unit", placeholder: "e.g. pushups, miles, steps" },
                { label: "Goal (total)", key: "goal", placeholder: "e.g. 1000", type: "number" },
                { label: "Emoji", key: "emoji", placeholder: "💪" },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600 }}>{f.label}</div>
                  <input type={f.type || "text"} value={newChallenge[f.key]} onChange={e => setNewChallenge(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <button onClick={handleCreateChallenge} style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 16, marginTop: 8, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2 }}>
                LAUNCH CHALLENGE 🚀
              </button>
            </div>
          </div>
        )}

        {/* PROFILE / STATS */}
        {screen === "profile" && (
          <div>
            {!userName ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
                <div style={{ fontWeight: 600 }}>Set your name first to see your stats</div>
              </div>
            ) : (() => {
              const history = getMyHistory();
              const badges = getUserBadges(userName, challenges);
              const totalReps = history.reduce((a, l) => a + l.amount, 0);
              const activeChallenges = challenges.filter(ch => (ch.logs || []).filter(l => l.user === userName).reduce((a, l) => a + l.amount, 0) > 0);
              const completedChallenges = challenges.filter(ch => {
                const t = (ch.logs || []).filter(l => l.user === userName).reduce((a, l) => a + l.amount, 0);
                return t >= ch.goal;
              });
              const grouped = {};
              history.forEach(entry => {
                if (!grouped[entry.date]) grouped[entry.date] = [];
                grouped[entry.date].push(entry);
              });
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20 }}>
                    <Avatar name={userName} size={56} />
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 2 }}>{userName}</div>
                      <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{badges.length} badge{badges.length !== 1 ? "s" : ""} earned</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
                    {[
                      { label: "reps/units", value: totalReps.toLocaleString(), sub: "Total Logged" },
                      { label: "challenges", value: activeChallenges.length, sub: "Active" },
                      { label: "finished", value: completedChallenges.length, sub: "Completed" },
                    ].map(stat => (
                      <div key={stat.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
                        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: "#f97316" }}>{stat.value}</div>
                        <div style={{ fontSize: 10, color: "#666", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  {badges.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <SectionLabel>YOUR BADGES</SectionLabel>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{badges.map(b => <BadgeChip key={b.id} badge={b} />)}</div>
                    </div>
                  )}
                  <SectionLabel>ACTIVITY HISTORY</SectionLabel>
                  {history.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#555" }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                      <div>No activity yet — go log something!</div>
                    </div>
                  )}
                  {Object.entries(grouped).map(([date, entries]) => (
                    <div key={date} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#f97316", fontFamily: "'Space Mono', monospace", fontWeight: 700, marginBottom: 8 }}>{formatDate(date)}</div>
                      {entries.map((entry, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px", marginBottom: 6 }}>
                          <div style={{ fontSize: 22 }}>{entry.challengeEmoji}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.challengeName}</div>
                            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{formatTs(entry.ts)}</div>
                          </div>
                          <div style={{ fontFamily: "'Space Mono', monospace", textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: "#f97316" }}>+{entry.amount.toLocaleString()}</div>
                            <div style={{ fontSize: 11, color: "#666" }}>{entry.unit}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(13,13,15,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "10px 0 16px", display: "flex", justifyContent: "center", zIndex: 100 }}>
        {navItems.map(item => (
          <button key={item.s} onClick={() => { setScreen(item.s); setSelectedChallenge(null); }}
            style={{ background: "none", border: "none", color: screen === item.s ? "#f97316" : "#555", cursor: "pointer", padding: "6px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace", letterSpacing: 1, transition: "color 0.2s" }}>
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
