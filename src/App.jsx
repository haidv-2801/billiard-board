import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  Plus,
  Minus,
  UserPlus,
  History,
  Trophy,
  Settings,
  ArrowRightLeft,
  Users,
  XCircle,
  Crown,
  Play,
  Trash2,
  ClipboardCopy,
  Check,
  FileText,
  Clock,
  Undo2,
  Edit2,
  RotateCcw,
  ScrollText,
  Share2,
} from 'lucide-react';
import {
  saveSession as dbSaveSession,
  getAllSessions as dbGetAllSessions,
  deleteSession as dbDeleteSession,
  saveAllPlayers as dbSaveAllPlayers,
  getAllPlayers as dbGetAllPlayers,
} from './lib/db';

import { Card, Button, Modal } from './components/ui';

// --- Main App ---

export default function App() {
  const SCORE_STEPS = [1, 5, 10, 15, 20];
  const PENALIZE_STEPS = [5, 10, 15, 20];

  // State quản lý Session
  const [session, setSession] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [sets, setSets] = useState([]);
  const [savedSessions, setSavedSessions] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);

  // State cho Set hiện tại
  const [currentSet, setCurrentSet] = useState(null);

  // UI State
  const [view, setView] = useState('home');
  const [modals, setModals] = useState({
    addPlayer: false,
    penalizeAll: false,
    transfer: false,
    editScore: false,
    endSession: false,
    report: false,
    editPlayer: false,
    editSessionName: false,
    history: false,
    confirmDeleteSet: false,
  });
  const [copied, setCopied] = useState(false);
  const [copiedHistory, setCopiedHistory] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState(null);
  const [preSelectedPlayers, setPreSelectedPlayers] = useState([]);

  const [tempData, setTempData] = useState({
    playerName: '',
    selectedPlayerId: null,
    targetPlayerId: null,
    transferAmount: 0,
    manualScore: 0,
    penalizeAmount: 0,
    sessionName: new Date().toLocaleDateString('vi-VN'),
    editPlayerName: '',
    editSessionName: '',
  });

  // --- IndexedDB: Load on mount ---
  useEffect(() => {
    dbGetAllSessions()
      .then(setSavedSessions)
      .catch((err) => {
        console.warn('Failed to load sessions from IndexedDB:', err);
      });
    dbGetAllPlayers()
      .then((players) => {
        if (players.length > 0) setAllPlayers(players);
      })
      .catch((err) => {
        console.warn('Failed to load players from IndexedDB:', err);
      });
  }, []);

  // --- IndexedDB: Auto-save session on every change ---
  const saveTimeout = useRef(null);

  const persistSession = useCallback(() => {
    if (!session) return;
    const record = {
      id: session.id,
      name: session.name,
      startTime:
        session.startTime instanceof Date
          ? session.startTime.toISOString()
          : session.startTime,
      players: session.players,
      sets: sets.map((s) => ({
        ...s,
        timestamp:
          s.timestamp instanceof Date ? s.timestamp.toISOString() : s.timestamp,
      })),
      currentSet,
      status: 'active',
    };
    dbSaveSession(record).catch((err) => {
      console.warn('Failed to save session to IndexedDB:', err);
    });
  }, [session, sets, currentSet]);

  useEffect(() => {
    if (!session) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(persistSession, 500);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [session, sets, currentSet, persistSession]);

  // Auto-save players
  useEffect(() => {
    if (allPlayers.length > 0) {
      dbSaveAllPlayers(allPlayers).catch((err) => {
        console.warn('Failed to save players to IndexedDB:', err);
      });
    }
  }, [allPlayers]);

  // --- Wake Lock: keep screen on during active set ---
  const wakeLockRef = useRef(null);

  useEffect(() => {
    const requestWakeLock = async () => {
      if (currentSet && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          /* ignore — user denied or not supported */
        }
      } else if (!currentSet && wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
    requestWakeLock();

    // Re-acquire wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        currentSet &&
        'wakeLock' in navigator
      ) {
        navigator.wakeLock
          .request('screen')
          .then((lock) => {
            wakeLockRef.current = lock;
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [currentSet]);

  // --- Handlers ---

  const refreshSavedSessions = useCallback(() => {
    dbGetAllSessions()
      .then(setSavedSessions)
      .catch(() => {});
  }, []);

  const createSession = (name) => {
    const newSession = {
      id: Date.now(),
      name: name || 'Phiên chơi ' + new Date().toLocaleDateString('vi-VN'),
      startTime: new Date(),
      players: preSelectedPlayers.length > 0 ? [...preSelectedPlayers] : [],
    };
    setSession(newSession);
    setSets([]);
    setCurrentSet(null);
    setActionHistory([]);
    setPreSelectedPlayers([]);
    setView('session');
  };

  const continueSession = (saved) => {
    setSession({
      id: saved.id,
      name: saved.name,
      startTime: new Date(saved.startTime),
      players: saved.players || [],
    });
    setSets(
      (saved.sets || []).map((s) => ({
        ...s,
        timestamp: new Date(s.timestamp),
      })),
    );
    setCurrentSet(saved.currentSet || null);
    setView('session');
  };

  const deleteSavedSession = async (id) => {
    await dbDeleteSession(id);
    refreshSavedSessions();
  };

  const endSession = async () => {
    if (session) {
      // Mark session as finished before going home
      const record = {
        id: session.id,
        name: session.name,
        startTime:
          session.startTime instanceof Date
            ? session.startTime.toISOString()
            : session.startTime,
        players: session.players,
        sets: sets.map((s) => ({
          ...s,
          timestamp:
            s.timestamp instanceof Date
              ? s.timestamp.toISOString()
              : s.timestamp,
        })),
        currentSet: null,
        status: 'finished',
        endTime: new Date().toISOString(),
      };
      await dbSaveSession(record).catch(() => {});
    }
    setSession(null);
    setSets([]);
    setCurrentSet(null);
    setModals((prev) => ({ ...prev, endSession: false }));
    refreshSavedSessions();
    setView('home');
  };

  const addPlayerToSession = (name, keepModalOpen = false) => {
    if (!name.trim()) return;
    const newPlayer = { id: Date.now().toString(), name: name.trim() };
    setSession((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
    }));

    // Nếu đang có set hiện tại, thêm điểm 0 cho người chơi mới
    if (currentSet) {
      setCurrentSet((prev) => ({
        ...prev,
        playerPoints: {
          ...prev.playerPoints,
          [newPlayer.id]: 0,
        },
      }));
    }

    setAllPlayers((prev) => {
      if (prev.find((p) => p.name === name.trim())) return prev;
      return [...prev, newPlayer];
    });
    logAction('Thêm người chơi', `${name.trim()} đã được thêm vào`);
    setTempData((prev) => ({ ...prev, playerName: '' }));
    if (!keepModalOpen) {
      setModals((prev) => ({ ...prev, addPlayer: false }));
    }
  };

  const startNewSet = () => {
    if (session.players.length < 2) return;
    const initialPoints = {};
    session.players.forEach((p) => (initialPoints[p.id] = 0));
    setCurrentSet({
      id: sets.length + 1,
      playerPoints: initialPoints,
    });
    setUndoStack([]);
    logAction('Bắt đầu set mới', `Set ${sets.length + 1} đã bắt đầu`);
  };

  const pushUndo = () => {
    if (!currentSet) return;
    setUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(currentSet))]);
  };

  const logAction = (action, details = '') => {
    const timestamp = new Date();
    const log = {
      id: Date.now(),
      timestamp,
      action,
      details,
      setId: currentSet?.id || sets.length,
    };
    setActionHistory((prev) => [...prev, log]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setCurrentSet(prev);
    setUndoStack((stack) => stack.slice(0, -1));
    logAction('Hoàn tác', 'Đã hoàn tác thao tác trước');
  };

  const updateScore = (playerId, delta) => {
    if (!currentSet) return;
    pushUndo();
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [playerId]: (prev.playerPoints[playerId] || 0) + delta,
      },
    }));
    const playerName = session.players.find((p) => p.id === playerId)?.name;
    logAction(
      'Cập nhật điểm',
      `${playerName}: ${delta > 0 ? '+' : ''}${delta} điểm`,
    );
  };

  const handleManualScoreChange = () => {
    if (!currentSet || tempData.selectedPlayerId === null) return;
    pushUndo();
    const playerName = session.players.find(
      (p) => p.id === tempData.selectedPlayerId,
    )?.name;
    const oldScore = currentSet.playerPoints[tempData.selectedPlayerId] || 0;
    const newScore = parseInt(tempData.manualScore) || 0;
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [tempData.selectedPlayerId]: newScore,
      },
    }));
    logAction('Chỉnh sửa điểm', `${playerName}: ${oldScore} → ${newScore}`);
    setModals((prev) => ({ ...prev, editScore: false }));
  };

  const handleRenamePlayer = () => {
    if (!tempData.selectedPlayerId || !tempData.editPlayerName.trim()) return;

    // Update trong session
    setSession((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === tempData.selectedPlayerId
          ? { ...p, name: tempData.editPlayerName.trim() }
          : p,
      ),
    }));

    // Update trong allPlayers
    setAllPlayers((prev) =>
      prev.map((p) =>
        p.id === tempData.selectedPlayerId
          ? { ...p, name: tempData.editPlayerName.trim() }
          : p,
      ),
    );

    setModals((prev) => ({ ...prev, editPlayer: false }));
    setTempData((prev) => ({
      ...prev,
      editPlayerName: '',
      selectedPlayerId: null,
    }));
  };

  const handleRenameSession = () => {
    if (!tempData.editSessionName.trim()) return;

    setSession((prev) => ({
      ...prev,
      name: tempData.editSessionName.trim(),
    }));

    setModals((prev) => ({ ...prev, editSessionName: false }));
    setTempData((prev) => ({ ...prev, editSessionName: '' }));
  };

  const handlePenalizeAllAction = () => {
    const winnerId = tempData.selectedPlayerId;
    const amountY = tempData.penalizeAmount;
    if (!currentSet || !winnerId) return;

    pushUndo();
    const newPoints = { ...currentSet.playerPoints };
    const otherPlayersCount = Object.keys(newPoints).length - 1;

    Object.keys(newPoints).forEach((id) => {
      if (id === winnerId) {
        newPoints[id] += otherPlayersCount * amountY;
      } else {
        newPoints[id] -= amountY;
      }
    });

    const winnerName = session.players.find((p) => p.id === winnerId)?.name;
    logAction(
      'Cả làng đền',
      `${winnerName} thắng, mỗi người đền ${amountY} điểm`,
    );
    setCurrentSet((prev) => ({ ...prev, playerPoints: newPoints }));
    setModals((prev) => ({ ...prev, penalizeAll: false }));
    setTempData((prev) => ({
      ...prev,
      selectedPlayerId: null,
      penalizeAmount: 0,
    }));
  };

  const handleTransfer = () => {
    const { selectedPlayerId, targetPlayerId, transferAmount } = tempData;
    if (
      !currentSet ||
      !selectedPlayerId ||
      !targetPlayerId ||
      selectedPlayerId === targetPlayerId ||
      transferAmount === 0
    )
      return;

    pushUndo();
    const fromName = session.players.find(
      (p) => p.id === selectedPlayerId,
    )?.name;
    const toName = session.players.find((p) => p.id === targetPlayerId)?.name;
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [selectedPlayerId]:
          prev.playerPoints[selectedPlayerId] - transferAmount,
        [targetPlayerId]: prev.playerPoints[targetPlayerId] + transferAmount,
      },
    }));
    logAction('X đền Y', `${fromName} đền ${toName} ${transferAmount} điểm`);
    setModals((prev) => ({ ...prev, transfer: false }));
    setTempData((prev) => ({ ...prev, transferAmount: 0 }));
  };

  const finishSet = () => {
    if (!currentSet) return;
    logAction('Kết thúc set', `Set ${currentSet.id} đã hoàn thành`);
    setSets((prev) => [...prev, { ...currentSet, timestamp: new Date() }]);
    setCurrentSet(null);
    setUndoStack([]);
  };

  const deleteSet = (setId) => {
    const deletedSet = sets.find((s) => s.id === setId);
    if (!deletedSet) return;

    setSets((prev) => prev.filter((s) => s.id !== setId));
    logAction('Xóa set', `Đã xóa Set ${setId}`);
    setConfirmDeleteSetId(null);
  };

  const resetCurrentSet = () => {
    if (!currentSet) return;
    pushUndo();
    const resetPoints = {};
    session.players.forEach((p) => (resetPoints[p.id] = 0));
    setCurrentSet((prev) => ({
      ...prev,
      playerPoints: resetPoints,
    }));
    logAction('Reset điểm', `Đã reset tất cả điểm Set ${currentSet.id} về 0`);
  };

  const calculateTotalScores = useMemo(() => {
    const totals = {};
    if (!session) return totals;
    session.players.forEach((p) => (totals[p.id] = 0));
    sets.forEach((set) => {
      Object.entries(set.playerPoints).forEach(([pid, score]) => {
        if (totals[pid] !== undefined) totals[pid] += score;
      });
    });
    return totals;
  }, [sets, session]);

  const sortedRankings = useMemo(() => {
    if (!session) return [];
    return [...session.players]
      .map((p) => ({ ...p, total: calculateTotalScores[p.id] || 0 }))
      .sort((a, b) => b.total - a.total);
  }, [session, calculateTotalScores]);

  // --- Report Generation ---
  const generateReport = useCallback(() => {
    if (!session) return '';

    const players = session.players;
    const totals = calculateTotalScores;
    const rankings = sortedRankings;
    const startTime =
      session.startTime instanceof Date
        ? session.startTime
        : new Date(session.startTime);

    // Header
    let report = '';
    report += `🎱 ${session.name}\n`;
    report += `📅 ${startTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    report += `⏰ Bắt đầu: ${startTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    report += ` | ${sets.length} set đã chơi\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Rankings
    report += `🏆 BẢNG XẾP HẠNG\n`;
    const medals = ['🥇', '🥈', '🥉'];
    rankings.forEach((p, idx) => {
      const medal = medals[idx] || `  ${idx + 1}.`;
      const sign = p.total > 0 ? '+' : '';
      report += `${medal} ${p.name}: ${sign}${p.total} điểm\n`;
    });
    report += `\n`;

    // Set details
    if (sets.length > 0) {
      report += `📋 CHI TIẾT TỪNG SET\n`;
      report += `─────────────────────────\n`;
      sets.forEach((set) => {
        const time =
          set.timestamp instanceof Date
            ? set.timestamp
            : new Date(set.timestamp);
        report += `Set ${set.id} (${time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}):\n`;
        players.forEach((p) => {
          const score = set.playerPoints[p.id] || 0;
          const sign = score > 0 ? '+' : '';
          report += `  ${p.name}: ${sign}${score}\n`;
        });
        report += `\n`;
      });
    }

    // Summary line
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📊 TỔNG KẾT\n`;
    players.forEach((p) => {
      const total = totals[p.id] || 0;
      const sign = total > 0 ? '+' : '';
      const bar = total > 0 ? '🟢' : total < 0 ? '🔴' : '⚪';
      report += `${bar} ${p.name}: ${sign}${total}\n`;
    });

    report += `\n🎱 Pool Master`;
    return report;
  }, [session, sets, calculateTotalScores, sortedRankings]);

  const handleCopyReport = async () => {
    const report = generateReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareReport = async () => {
    const report = generateReport();
    if (navigator.share) {
      try {
        await navigator.share({
          title: session?.name || 'Pool Master',
          text: report,
        });
      } catch {
        /* user cancelled share — ignore */
      }
    } else {
      // Fallback: copy to clipboard if Web Share not supported
      handleCopyReport();
    }
  };

  const generateHistoryReport = useCallback(() => {
    if (actionHistory.length === 0) return 'Chưa có lịch sử thao tác';

    let report = `📜 LỊCH SỬ THAO TÁC - ${session?.name}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    actionHistory.forEach((log, idx) => {
      const time =
        log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
      report += `${idx + 1}. [${time.toLocaleTimeString('vi-VN')}] ${log.action}\n`;
      if (log.details) {
        report += `   ${log.details}\n`;
      }
      report += `\n`;
    });

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `Tổng ${actionHistory.length} thao tác`;
    return report;
  }, [actionHistory, session]);

  const handleCopyHistory = async () => {
    const report = generateHistoryReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopiedHistory(true);
      setTimeout(() => setCopiedHistory(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedHistory(true);
      setTimeout(() => setCopiedHistory(false), 2000);
    }
  };

  // --- Format helpers ---
  const formatTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  };

  // --- Views ---

  if (view === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center p-6">
        <div className="w-full max-w-md space-y-8 pt-12">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-extrabold text-blue-600 tracking-tight">
              Pool Master
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Trình tính điểm Billiard chuyên nghiệp
            </p>
          </div>

          {/* New Session */}
          <Card className="p-6 space-y-4">
            <div className="text-left space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Tên Phiên Chơi
              </label>
              <input
                className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                placeholder="Ví dụ: Tối Thứ 6 Cùng Quý"
                value={tempData.sessionName || ''}
                onChange={(e) =>
                  setTempData({ ...tempData, sessionName: e.target.value })
                }
                onKeyDown={(e) =>
                  e.key === 'Enter' && createSession(tempData.sessionName)
                }
              />
            </div>
            <Button
              className="w-full py-4 text-lg"
              onClick={() => createSession(tempData.sessionName)}
            >
              Bắt Đầu Session Mới
            </Button>
          </Card>

          {/* Saved Sessions */}
          {savedSessions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} /> Phiên chơi đã lưu
              </h3>
              <div className="space-y-2">
                {savedSessions.map((s) => (
                  <Card
                    key={s.id}
                    className="p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 dark:text-white truncate">
                            {s.name}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              s.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {s.status === 'active' ? 'Đang chơi' : 'Đã xong'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {(s.players || []).length} người chơi
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            •
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {(s.sets || []).length} set
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            •
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {formatTimeAgo(s.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => continueSession(s)}
                          className="p-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 rounded-xl transition-colors cursor-pointer"
                          title="Tiếp tục"
                        >
                          <Play size={18} />
                        </button>
                        {confirmDeleteId === s.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                deleteSavedSession(s.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Xoá
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Huỷ
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="p-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 rounded-xl transition-colors cursor-pointer"
                            title="Xoá"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Old players - clickable to pre-select */}
          {allPlayers.length > 0 && (
            <div className="text-left space-y-3">
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Người chơi cũ{' '}
                {preSelectedPlayers.length > 0 && (
                  <span className="text-blue-500 dark:text-blue-400 normal-case">
                    — đã chọn {preSelectedPlayers.length}
                  </span>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {allPlayers.slice(0, 10).map((p) => {
                  const isSelected = preSelectedPlayers.some(
                    (pp) => pp.id === p.id,
                  );
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPreSelectedPlayers((prev) =>
                          isSelected
                            ? prev.filter((pp) => pp.id !== p.id)
                            : [...prev, p],
                        );
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:text-blue-500'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-800 dark:text-white truncate max-w-[200px]">
                  {session?.name}
                </h2>
                <button
                  onClick={() => {
                    setTempData((prev) => ({
                      ...prev,
                      editSessionName: session.name,
                    }));
                    setModals({ ...modals, editSessionName: true });
                  }}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  title="Đổi tên phiên chơi"
                >
                  <Edit2 size={16} className="text-slate-400" />
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bắt đầu:{' '}
                {session?.startTime instanceof Date
                  ? session.startTime.toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : new Date(session?.startTime).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setModals({ ...modals, history: true })}
              className="flex items-center gap-1.5 text-sm"
            >
              <ScrollText size={16} /> Log
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModals({ ...modals, report: true })}
              className="flex items-center gap-1.5 text-sm"
            >
              <FileText size={16} /> Báo cáo
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModals({ ...modals, endSession: true })}
            >
              Kết thúc
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 space-y-6 order-2 lg:order-1">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                <Users size={18} /> Người Chơi
              </h3>
              <button
                onClick={() => setModals({ ...modals, addPlayer: true })}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
              >
                <UserPlus size={20} />
              </button>
            </div>
            <div className="space-y-2">
              {session.players.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setTempData((prev) => ({
                      ...prev,
                      selectedPlayerId: p.id,
                      editPlayerName: p.name,
                    }));
                    setModals({ ...modals, editPlayer: true });
                  }}
                  className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium truncate text-slate-700 dark:text-slate-200">
                      {p.name}
                    </span>
                    <button
                      onClick={() => {
                        setTempData((prev) => ({
                          ...prev,
                          selectedPlayerId: p.id,
                          editPlayerName: p.name,
                        }));
                        setModals({ ...modals, editPlayer: true });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded cursor-pointer"
                      title="Đổi tên"
                    >
                      <Edit2 size={14} className="text-slate-400" />
                    </button>
                  </div>
                  <span
                    className={`font-bold tabular-nums ${calculateTotalScores[p.id] >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                  >
                    {calculateTotalScores[p.id] > 0 ? '+' : ''}
                    {calculateTotalScores[p.id]}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none shadow-lg">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <Trophy size={18} /> Bảng Xếp Hạng
            </h3>
            <div className="space-y-3">
              {sortedRankings.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-[10px] font-black">
                    {idx + 1}
                  </span>
                  <span className="flex-1 font-medium truncate">{p.name}</span>
                  <span className="font-bold tabular-nums">{p.total}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-9 space-y-6 order-1 lg:order-2">
          {!currentSet ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center animate-pulse">
                <Plus size={40} />
              </div>
              <Button
                disabled={session.players.length < 2}
                className="px-10 py-4 text-lg shadow-xl shadow-blue-200 dark:shadow-blue-900/30"
                onClick={startNewSet}
              >
                Vào Bàn Ngay
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                  SET {currentSet.id}
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="secondary"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="flex items-center gap-1 text-sm"
                  >
                    <Undo2 size={14} /> Hoàn tác{' '}
                    {undoStack.length > 0 && `(${undoStack.length})`}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={resetCurrentSet}
                    className="flex items-center gap-1 text-sm"
                  >
                    <RotateCcw size={14} /> Reset
                  </Button>
                  <Button
                    variant="warning"
                    onClick={() => setModals({ ...modals, penalizeAll: true })}
                    className="flex items-center gap-1 text-sm"
                  >
                    <Crown size={14} /> Cả làng đền
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setModals({ ...modals, transfer: true })}
                    className="flex items-center gap-1 text-sm"
                  >
                    <ArrowRightLeft size={14} /> X đền Y
                  </Button>
                </div>
              </div>

              {/* Player Score Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {session.players.map((p) => (
                  <Card
                    key={p.id}
                    className="p-5 flex flex-col items-center space-y-4 relative group"
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setTempData({
                            ...tempData,
                            selectedPlayerId: p.id,
                            manualScore: currentSet.playerPoints[p.id] || 0,
                          });
                          setModals({ ...modals, editScore: true });
                        }}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 cursor-pointer"
                      >
                        <Settings size={20} />
                      </button>
                    </div>

                    <div className="text-center">
                      <p className="font-black text-slate-400 dark:text-slate-500 text-xs uppercase tracking-[0.2em]">
                        {p.name}
                      </p>
                      <div className="text-7xl font-black tabular-nums my-1 text-slate-800 dark:text-white">
                        {currentSet.playerPoints[p.id] || 0}
                      </div>
                    </div>

                    <div className="flex w-full gap-2">
                      <button
                        onClick={() => updateScore(p.id, -1)}
                        className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                      >
                        <Minus size={28} />
                      </button>
                      <button
                        onClick={() => updateScore(p.id, 1)}
                        className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/30 transition-all cursor-pointer"
                      >
                        <Plus size={28} />
                      </button>
                    </div>

                    {/* Step Controls */}
                    <div className="w-full space-y-2">
                      <div className="grid grid-cols-5 w-full gap-1.5">
                        {SCORE_STEPS.map((val) => (
                          <button
                            key={`plus-${val}`}
                            onClick={() => updateScore(p.id, val)}
                            className="py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-black text-[10px] rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800 cursor-pointer"
                          >
                            +{val}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-5 w-full gap-1.5">
                        {SCORE_STEPS.map((val) => (
                          <button
                            key={`minus-${val}`}
                            onClick={() => updateScore(p.id, -val)}
                            className="py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-black text-[10px] rounded-lg hover:bg-red-100 transition-colors border border-red-100 dark:border-red-800 cursor-pointer"
                          >
                            -{val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <Button
                  variant="success"
                  className="w-full py-5 text-xl font-black shadow-xl shadow-emerald-100 dark:shadow-none uppercase tracking-widest"
                  onClick={finishSet}
                >
                  Kết Thúc Set & Lưu
                </Button>
              </div>
            </div>
          )}

          {/* History */}
          {sets.length > 0 && (
            <div className="mt-12 space-y-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-400 dark:text-slate-500 uppercase tracking-widest text-xs px-2">
                <History size={16} /> Nhật ký ván đấu
              </h3>
              <div className="space-y-3">
                {[...sets].reverse().map((set) => (
                  <Card
                    key={set.id}
                    className="p-4 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 group"
                  >
                    <div>
                      <span className="font-black text-slate-700 dark:text-slate-300">
                        SET {set.id}
                      </span>
                      <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                        {(set.timestamp instanceof Date
                          ? set.timestamp
                          : new Date(set.timestamp)
                        ).toLocaleTimeString('vi-VN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-4 overflow-x-auto no-scrollbar">
                        {session.players.map((p) => (
                          <div key={p.id} className="text-right min-w-[60px]">
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-bold truncate">
                              {p.name}
                            </p>
                            <p
                              className={`font-black tabular-nums ${set.playerPoints[p.id] >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-red-400'}`}
                            >
                              {set.playerPoints[p.id] > 0 ? '+' : ''}
                              {set.playerPoints[p.id]}
                            </p>
                          </div>
                        ))}
                      </div>
                      {confirmDeleteSetId === set.id ? (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => deleteSet(set.id)}
                            className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded transition-colors cursor-pointer"
                          >
                            Xóa
                          </button>
                          <button
                            onClick={() => setConfirmDeleteSetId(null)}
                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold rounded transition-colors cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteSetId(set.id)}
                          className="opacity-0 group-hover:opacity-100 ml-2 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 rounded transition-all cursor-pointer"
                          title="Xóa set"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- Modals --- */}
      <Modal
        isOpen={modals.addPlayer}
        onClose={() => setModals({ ...modals, addPlayer: false })}
        title="Thêm Người Chơi"
      >
        <div className="space-y-4">
          <input
            autoFocus
            className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="Tên người chơi..."
            value={tempData.playerName}
            onChange={(e) =>
              setTempData({ ...tempData, playerName: e.target.value })
            }
            onKeyDown={(e) =>
              e.key === 'Enter' && addPlayerToSession(tempData.playerName)
            }
          />
          <Button
            className="w-full py-4"
            onClick={() => addPlayerToSession(tempData.playerName)}
          >
            Xác Nhận
          </Button>

          {/* Quick add from old players */}
          {(() => {
            const sessionPlayerNames =
              session?.players?.map((p) => p.name) || [];
            const availablePlayers = allPlayers.filter(
              (p) => !sessionPlayerNames.includes(p.name),
            );
            if (availablePlayers.length === 0) return null;
            return (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Thêm nhanh
                </label>
                <div className="flex flex-wrap gap-2">
                  {availablePlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addPlayerToSession(p.name, true)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all cursor-pointer"
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>

      <Modal
        isOpen={modals.penalizeAll}
        onClose={() => setModals({ ...modals, penalizeAll: false })}
        title="Cả Làng Đền"
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Người thắng (Người được đền)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {session.players.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setTempData({ ...tempData, selectedPlayerId: p.id })
                  }
                  className={`p-3 rounded-xl font-bold border-2 transition-all cursor-pointer ${tempData.selectedPlayerId === p.id ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Mức đền (cộng dồn)
            </label>
            <div className="text-center bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Tổng mức đền:
              </span>
              <span className="ml-2 text-3xl font-black text-amber-600">
                {tempData.penalizeAmount}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">
                điểm
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PENALIZE_STEPS.map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      penalizeAmount: prev.penalizeAmount + val,
                    }))
                  }
                  className="py-3 rounded-xl font-black text-sm bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                setTempData((prev) => ({ ...prev, penalizeAmount: 0 }))
              }
              className="w-full py-2 rounded-lg text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
            >
              Reset về 0
            </button>
          </div>
          <Button
            variant="success"
            className="w-full py-4 text-lg font-black"
            disabled={
              !tempData.selectedPlayerId || tempData.penalizeAmount === 0
            }
            onClick={handlePenalizeAllAction}
          >
            Thực Hiện Đền ({tempData.penalizeAmount} điểm)
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modals.transfer}
        onClose={() => setModals({ ...modals, transfer: false })}
        title="X Đền Y"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-11 items-center gap-1">
            <div className="col-span-5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                Người Đền (X)
              </label>
              <select
                className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none font-bold text-sm text-slate-800 dark:text-white"
                value={tempData.selectedPlayerId || ''}
                onChange={(e) =>
                  setTempData({ ...tempData, selectedPlayerId: e.target.value })
                }
              >
                <option value="">Chọn...</option>
                {session.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-1 text-center mt-6 text-slate-300 dark:text-slate-500">
              <ArrowRightLeft size={16} />
            </div>
            <div className="col-span-5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                Người Nhận (Y)
              </label>
              <select
                className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none font-bold text-sm text-slate-800 dark:text-white"
                value={tempData.targetPlayerId || ''}
                onChange={(e) =>
                  setTempData({ ...tempData, targetPlayerId: e.target.value })
                }
              >
                <option value="">Chọn...</option>
                {session.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Mức đền (cộng dồn)
            </label>
            <div className="text-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Tổng cộng:
              </span>
              <span className="ml-2 text-3xl font-black text-blue-600">
                {tempData.transferAmount}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">
                điểm
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PENALIZE_STEPS.map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setTempData((prev) => ({
                      ...prev,
                      transferAmount: prev.transferAmount + val,
                    }))
                  }
                  className="py-3 rounded-xl font-black text-sm bg-blue-500 hover:bg-blue-600 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                setTempData((prev) => ({ ...prev, transferAmount: 0 }))
              }
              className="w-full py-2 rounded-lg text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
            >
              Reset về 0
            </button>
          </div>

          <Button
            className="w-full py-4 text-lg font-black uppercase"
            disabled={
              !tempData.selectedPlayerId ||
              !tempData.targetPlayerId ||
              tempData.selectedPlayerId === tempData.targetPlayerId ||
              tempData.transferAmount === 0
            }
            onClick={handleTransfer}
          >
            Xác nhận đền ({tempData.transferAmount} điểm)
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modals.editScore}
        onClose={() => setModals({ ...modals, editScore: false })}
        title="Chỉnh Sửa Điểm Tuyệt Đối"
      >
        <div className="space-y-4">
          <input
            type="number"
            className="text-7xl font-black w-full bg-slate-50 dark:bg-slate-900 p-8 rounded-2xl text-center outline-none text-blue-600 dark:text-blue-400"
            value={tempData.manualScore}
            onChange={(e) =>
              setTempData({ ...tempData, manualScore: e.target.value })
            }
            autoFocus
          />
          <Button
            className="w-full py-4 text-lg font-bold"
            onClick={handleManualScoreChange}
          >
            Lưu Thay Đổi
          </Button>
        </div>
      </Modal>

      {/* Edit Player Name Modal */}
      <Modal
        isOpen={modals.editPlayer}
        onClose={() => setModals({ ...modals, editPlayer: false })}
        title="Đổi Tên Người Chơi"
      >
        <div className="space-y-4">
          <input
            type="text"
            className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="Tên mới..."
            value={tempData.editPlayerName}
            onChange={(e) =>
              setTempData({ ...tempData, editPlayerName: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && handleRenamePlayer()}
            autoFocus
          />
          <Button
            className="w-full py-4 text-lg font-bold"
            onClick={handleRenamePlayer}
            disabled={!tempData.editPlayerName.trim()}
          >
            Lưu Thay Đổi
          </Button>
        </div>
      </Modal>

      {/* Edit Session Name Modal */}
      <Modal
        isOpen={modals.editSessionName}
        onClose={() => setModals({ ...modals, editSessionName: false })}
        title="Đổi Tên Phiên Chơi"
      >
        <div className="space-y-4">
          <input
            type="text"
            className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="Tên phiên chơi mới..."
            value={tempData.editSessionName}
            onChange={(e) =>
              setTempData({ ...tempData, editSessionName: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSession()}
            autoFocus
          />
          <Button
            className="w-full py-4 text-lg font-bold"
            onClick={handleRenameSession}
            disabled={!tempData.editSessionName.trim()}
          >
            Lưu Thay Đổi
          </Button>
        </div>
      </Modal>

      {/* Report Modal */}
      <Modal
        isOpen={modals.report}
        onClose={() => setModals({ ...modals, report: false })}
        title="Báo Cáo Phiên Chơi"
      >
        <div className="space-y-4">
          <pre className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[50vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
            {generateReport()}
          </pre>
          <div className="flex gap-2">
            <Button
              className="flex-1 py-4 text-lg font-bold flex items-center justify-center gap-2"
              variant={copied ? 'success' : 'primary'}
              onClick={handleCopyReport}
            >
              {copied ? (
                <>
                  <Check size={20} /> Đã Copy!
                </>
              ) : (
                <>
                  <ClipboardCopy size={20} /> Copy
                </>
              )}
            </Button>
            <Button
              className="flex-1 py-4 text-lg font-bold flex items-center justify-center gap-2"
              variant="secondary"
              onClick={handleShareReport}
            >
              <Share2 size={20} /> Chia sẻ
            </Button>
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={modals.history}
        onClose={() => setModals({ ...modals, history: false })}
        title="Lịch Sử Thao Tác"
      >
        <div className="space-y-4">
          {actionHistory.length === 0 ? (
            <p className="text-center text-slate-400 dark:text-slate-500 py-8">
              Chưa có lịch sử thao tác
            </p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {[...actionHistory].reverse().map((log, idx) => {
                const time =
                  log.timestamp instanceof Date
                    ? log.timestamp
                    : new Date(log.timestamp);
                return (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-bold text-sm text-slate-800 dark:text-white">
                          {log.action}
                        </p>
                        {log.details && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {log.details}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {time.toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Button
            className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2"
            variant={copiedHistory ? 'success' : 'primary'}
            onClick={handleCopyHistory}
            disabled={actionHistory.length === 0}
          >
            {copiedHistory ? (
              <>
                <Check size={20} /> Đã Copy!
              </>
            ) : (
              <>
                <ClipboardCopy size={20} /> Copy Lịch Sử
              </>
            )}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modals.endSession}
        onClose={() => setModals({ ...modals, endSession: false })}
        title="Kết Thúc"
      >
        <div className="space-y-6">
          <p className="text-slate-500 dark:text-slate-400">
            Phiên chơi sẽ được lưu lại. Bạn có thể tiếp tục sau từ trang chủ.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setModals({ ...modals, endSession: false })}
            >
              Huỷ
            </Button>
            <Button
              variant="danger"
              className="flex-1 font-bold"
              onClick={endSession}
            >
              Kết Thúc & Lưu
            </Button>
          </div>
        </div>
      </Modal>

      {!currentSet && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xs px-4">
          <Button
            disabled={session.players.length < 2}
            className="w-full py-5 rounded-2xl shadow-2xl dark:shadow-blue-900/30 flex items-center justify-center gap-2 text-xl font-black uppercase tracking-tighter"
            onClick={startNewSet}
          >
            <Plus size={28} /> Bắt Đầu Ván Mới
          </Button>
        </div>
      )}
    </div>
  );
}
