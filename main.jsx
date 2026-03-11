import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Minus, 
  UserPlus, 
  Trash2, 
  History, 
  Trophy, 
  UserCircle, 
  Settings, 
  AlertCircle,
  ArrowRightLeft,
  Users,
  CheckCircle2,
  XCircle,
  Save,
  Crown
} from 'lucide-react';

// --- Components ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", className = "", disabled = false }) => {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200",
    danger: "bg-red-500 text-white hover:bg-red-600",
    success: "bg-emerald-500 text-white hover:bg-emerald-600",
    warning: "bg-amber-500 text-white hover:bg-amber-600",
    outline: "border border-slate-300 text-slate-600 hover:bg-slate-50"
  };
  return (
    <button 
      disabled={disabled}
      onClick={onClick} 
      className={`px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><XCircle size={24} /></button>
        </div>
        <div className="p-4 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const SCORE_STEPS = [1, 5, 10, 15, 20];
  const MULTIPLIERS = [1, 2, 3, 4, 5];

  // State quản lý Session
  const [session, setSession] = useState(null); 
  const [allPlayers, setAllPlayers] = useState([]); 
  const [sets, setSets] = useState([]); 
  
  // State cho Set hiện tại
  const [currentSet, setCurrentSet] = useState(null); 
  
  // UI State
  const [view, setView] = useState('home'); 
  const [modals, setModals] = useState({
    addPlayer: false,
    penalizeAll: false,
    transfer: false,
    editScore: false,
    endSession: false
  });
  
  const [tempData, setTempData] = useState({
    playerName: '',
    selectedPlayerId: null,
    targetPlayerId: null,
    transferAmount: 1,
    transferMultiplier: 1, // Hệ số nhân mới cho X đền Y
    manualScore: 0,
    penalizeAmount: 1 
  });

  // --- Handlers ---

  const createSession = (name) => {
    const newSession = {
      id: Date.now(),
      name: name || Phiên chơi ${new Date().toLocaleDateString('vi-VN')},
      startTime: new Date(),
      players: []
    };
    setSession(newSession);
    setSets([]);
    setView('session');
  };

  const addPlayerToSession = (name) => {
    if (!name.trim()) return;
    const newPlayer = { id: Date.now().toString(), name: name.trim() };
    setSession(prev => ({
      ...prev,
      players: [...prev.players, newPlayer]
    }));
    setAllPlayers(prev => {
      if (prev.find(p => p.name === name)) return prev;
      return [...prev, newPlayer];
    });
    setTempData(prev => ({ ...prev, playerName: '' }));
    setModals(prev => ({ ...prev, addPlayer: false }));
  };

  const startNewSet = () => {
    if (session.players.length < 2) return;
    const initialPoints = {};
    session.players.forEach(p => initialPoints[p.id] = 0);
    setCurrentSet({
      id: sets.length + 1,
      playerPoints: initialPoints
    });
  };

  const updateScore = (playerId, delta) => {
    if (!currentSet) return;
    setCurrentSet(prev => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [playerId]: prev.playerPoints[playerId] + delta
      }
    }));
  };

  const handleManualScoreChange = () => {
    if (!currentSet || tempData.selectedPlayerId === null) return;
    setCurrentSet(prev => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [tempData.selectedPlayerId]: parseInt(tempData.manualScore) || 0
      }
    }));
    setModals(prev => ({ ...prev, editScore: false }));
  };

  const handlePenalizeAllAction = () => {
    const winnerId = tempData.selectedPlayerId;
    const amountY = tempData.penalizeAmount;
    if (!currentSet || !winnerId) return;

    const newPoints = { ...currentSet.playerPoints };
    const otherPlayersCount = Object.keys(newPoints).length - 1;
    
    Object.keys(newPoints).forEach(id => {
      if (id === winnerId) {
        newPoints[id] += otherPlayersCount * amountY;
      } else {
        newPoints[id] -= amountY;
      }
    });

    setCurrentSet(prev => ({ ...prev, playerPoints: newPoints }));
    setModals(prev => ({ ...prev, penalizeAll: false }));
    setTempData(prev => ({ ...prev, selectedPlayerId: null }));
  };

  const handleTransfer = () => {
    const { selectedPlayerId, targetPlayerId, transferAmount, transferMultiplier } = tempData;
    if (!currentSet || !selectedPlayerId || !targetPlayerId || selectedPlayerId === targetPlayerId) return;
    
    const totalToTransfer = parseInt(transferAmount) * parseInt(transferMultiplier);

    setCurrentSet(prev => ({
      ...prev,
      playerPoints: {
        ...prev.playerPoints,
        [selectedPlayerId]: prev.playerPoints[selectedPlayerId] - totalToTransfer,
        [targetPlayerId]: prev.playerPoints[targetPlayerId] + totalToTransfer
      }
    }));
    setModals(prev => ({ ...prev, transfer: false }));
  };

  const finishSet = () => {
    if (!currentSet) return;
    setSets(prev => [...prev, { ...currentSet, timestamp: new Date() }]);
    setCurrentSet(null);
  };

  const calculateTotalScores = useMemo(() => {
    const totals = {};
    if (!session) return totals;
    session.players.forEach(p => totals[p.id] = 0);
    sets.forEach(set => {
      Object.entries(set.playerPoints).forEach(([pid, score]) => {
        if (totals[pid] !== undefined) totals[pid] += score;
      });
    });
    return totals;
  }, [sets, session]);

  const sortedRankings = useMemo(() => {
    if (!session) return [];
    return [...session.players]
      .map(p => ({ ...p, total: calculateTotalScores[p.id] || 0 }))
      .sort((a, b) => b.total - a.total);
  }, [session, calculateTotalScores]);

  // --- Views ---

  if (view === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold text-blue-600 tracking-tight">Pool Master</h1>
            <p className="text-slate-500 font-medium">Trình tính điểm Billiard chuyên nghiệp</p>
          </div>
          
          <Card className="p-6 space-y-4">
            <div className="text-left space-y-2">
              <label className="text-sm font-semibold text-slate-600">Tên Phiên Chơi</label>
              <input 
                className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="Ví dụ: Tối Thứ 6 Cùng Quý"
                value={tempData.sessionName || ''}
                onChange={(e) => setTempData({...tempData, sessionName: e.target.value})}
              />
            </div>
            <Button className="w-full py-4 text-lg" onClick={() => createSession(tempData.sessionName)}>
              Bắt Đầu Session Mới
            </Button>
          </Card>

          {allPlayers.length > 0 && (
            <div className="text-left space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Người chơi cũ</h3>
              <div className="flex flex-wrap gap-2">
                {allPlayers.slice(0, 10).map(p => (
                  <span key={p.id} className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm text-slate-600 dark:text-slate-300">
                    {p.name}
                  </span>
                ))}
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
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white truncate max-w-[200px]">{session?.name}</h2>
            <p className="text-xs text-slate-500">Bắt đầu: {session?.startTime.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setModals({...modals, endSession: true})}>Kết thúc</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <div className="lg:col-span-3 space-y-6 order-2 lg:order-1">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold flex items-center gap-2"><Users size={18}/> Người Chơi</h3>
              <button onClick={() => setModals({...modals, addPlayer: true})} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><UserPlus size={20}/></button>
            </div>
            <div className="space-y-2">
              {session.players.map(p => (
                <div key={p.id} className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <span className="font-medium truncate mr-2">{p.name}</span>
                  <span className={`font-bold tabular-nums ${calculateTotalScores[p.id] >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {calculateTotalScores[p.id] > 0 ? '+' : ''}{calculateTotalScores[p.id]}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none shadow-lg">
            <h3 className="font-bold flex items-center gap-2 mb-4"><Trophy size={18}/> Bảng Xếp Hạng</h3>
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
                className="px-10 py-4 text-lg shadow-xl shadow-blue-200"
                onClick={startNewSet}
              >
                Vào Bàn Ngay
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">SET {currentSet.id}</h3>
                <div className="flex gap-2">
                  <Button variant="warning" onClick={() => setModals({...modals, penalizeAll: true})} className="flex items-center gap-1 text-sm">
                    <Crown size={14}/> Cả làng đền
                  </Button>
                  <Button variant="secondary" onClick={() => setModals({...modals, transfer: true})} className="flex items-center gap-1 text-sm">
                    <ArrowRightLeft size={14}/> X đền Y
                  </Button>
                </div>
              </div>

              {/* Player Score Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {session.players.map(p => (
                  <Card key={p.id} className="p-5 flex flex-col items-center space-y-4 relative group">
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setTempData({...tempData, selectedPlayerId: p.id, manualScore: currentSet.playerPoints[p.id]});
                          setModals({...modals, editScore: true});
                        }}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400"
                      >
                        <Settings size={20}/>
                      </button>
                    </div>
                    
                    <div className="text-center">
                      <p className="font-black text-slate-400 text-xs uppercase tracking-[0.2em]">{p.name}</p>
                      <div className="text-7xl font-black tabular-nums my-1 text-slate-800 dark:text-white">
                        {currentSet.playerPoints[p.id]}
                      </div>
                    </div>

                    <div className="flex w-full gap-2">
                      <button 
                        onClick={() => updateScore(p.id, -1)}
                        className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 transition-all"
                      >
                        <Minus size={28} />
                      </button>
                      <button 
                        onClick={() => updateScore(p.id, 1)}
                        className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 transition-all"
                      >
                        <Plus size={28} />
                      </button>
                    </div>

                    {/* Step Controls */}
                    <div className="w-full space-y-2">
                      <div className="grid grid-cols-5 w-full gap-1.5">
                        {SCORE_STEPS.map(val => (
                          <button 
                            key={`plus-${val}`}
                            onClick={() => updateScore(p.id, val)}
                            className="py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-black text-[10px] rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800"
                          >
                            +{val}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-5 w-full gap-1.5">
                        {SCORE_STEPS.map(val => (
                          <button 
                            key={`minus-${val}`}
                            onClick={() => updateScore(p.id, -val)}
                            className="py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-black text-[10px] rounded-lg hover:bg-red-100 transition-colors border border-red-100 dark:border-red-800"
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
                <Button variant="success" className="w-full py-5 text-xl font-black shadow-xl shadow-emerald-100 dark:shadow-none uppercase tracking-widest" onClick={finishSet}>
                  Kết Thúc Set & Lưu
                </Button>
              </div>
            </div>
          )}

          {/* History */}
          {sets.length > 0 && (
            <div className="mt-12 space-y-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-400 uppercase tracking-widest text-xs px-2"><History size={16}/> Nhật ký ván đấu</h3>
              <div className="space-y-3">
                {[...sets].reverse().map((set) => (
                  <Card key={set.id} className="p-4 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                    <div>
                      <span className="font-black text-slate-700 dark:text-slate-300">SET {set.id}</span>
                      <p className="text-[10px] font-medium text-slate-400">{set.timestamp.toLocaleTimeString('vi-VN')}</p>
                    </div>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar">
                      {session.players.map(p => (
                        <div key={p.id} className="text-right min-w-[60px]">
                          <p className="text-[9px] text-slate-400 uppercase font-bold truncate">{p.name}</p>
                          <p className={`font-black tabular-nums ${set.playerPoints[p.id] >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-red-400'}`}>
                            {set.playerPoints[p.id] > 0 ? '+' : ''}{set.playerPoints[p.id]}
                          </p>
                        </div>
                      ))}
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
        onClose={() => setModals({...modals, addPlayer: false})}
        title="Thêm Người Chơi"
      >
        <div className="space-y-4">
          <input 
            autoFocus
            className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium"
            placeholder="Tên người chơi..."
            value={tempData.playerName}
            onChange={(e) => setTempData({...tempData, playerName: e.target.value})}
            onKeyDown={(e) => e.key === 'Enter' && addPlayerToSession(tempData.playerName)}
          />
          <Button className="w-full py-4" onClick={() => addPlayerToSession(tempData.playerName)}>Xác Nhận</Button>
        </div>
      </Modal>

      <Modal 
        isOpen={modals.penalizeAll} 
        onClose={() => setModals({...modals, penalizeAll: false})}
        title="Cả Làng Đền"
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Người thắng (Người được đền)</label>
            <div className="grid grid-cols-2 gap-2">
              {session.players.map(p => (
                <button 
                  key={p.id}
                  onClick={() => setTempData({...tempData, selectedPlayerId: p.id})}
                  className={`p-3 rounded-xl font-bold border-2 transition-all ${tempData.selectedPlayerId === p.id ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mức đền (Y điểm)</label>
            <div className="grid grid-cols-5 gap-1.5">
              {SCORE_STEPS.map(val => (
                <button 
                  key={val}
                  onClick={() => setTempData({...tempData, penalizeAmount: val})}
                  className={`py-2 rounded-lg font-black text-sm border-2 transition-all ${tempData.penalizeAmount === val ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-500'}`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
          <Button variant="success" className="w-full py-4 text-lg font-black" disabled={!tempData.selectedPlayerId} onClick={handlePenalizeAllAction}>
            Thực Hiện Đền
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={modals.transfer} 
        onClose={() => setModals({...modals, transfer: false})}
        title="X Đền Y (Tùy Chỉnh)"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-11 items-center gap-1">
            <div className="col-span-5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Người Đền (X)</label>
              <select className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none font-bold text-sm" value={tempData.selectedPlayerId || ''} onChange={(e) => setTempData({...tempData, selectedPlayerId: e.target.value})}>
                <option value="">Chọn...</option>
                {session.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-span-1 text-center mt-6 text-slate-300"><ArrowRightLeft size={16} /></div>
            <div className="col-span-5 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Người Nhận (Y)</label>
              <select className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none font-bold text-sm" value={tempData.targetPlayerId || ''} onChange={(e) => setTempData({...tempData, targetPlayerId: e.target.value})}>
                <option value="">Chọn...</option>
                {session.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          
          <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chọn mức điểm cơ bản</label>
              <div className="grid grid-cols-5 gap-1.5">
                {SCORE_STEPS.map(val => (
                  <button 
                    key={val} 
                    onClick={() => setTempData({...tempData, transferAmount: val})} 
                    className={`py-2 rounded-lg font-black text-sm border-2 transition-all ${tempData.transferAmount === val ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center text-slate-400 font-bold py-1">
              <XCircle size={14} className="mr-1" /> nhân với
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hệ số nhân (Số lần)</label>
              <div className="grid grid-cols-5 gap-1.5">
                {MULTIPLIERS.map(m => (
                  <button 
                    key={m} 
                    onClick={() => setTempData({...tempData, transferMultiplier: m})} 
                    className={`py-2 rounded-lg font-black text-sm border-2 transition-all ${tempData.transferMultiplier === m ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    x{m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
             <span className="text-sm text-slate-500 font-medium">Tổng cộng:</span>
             <span className="ml-2 text-2xl font-black text-blue-600">
                {tempData.transferAmount * tempData.transferMultiplier} điểm
             </span>
          </div>

          <Button 
            className="w-full py-4 text-lg font-black uppercase" 
            disabled={!tempData.selectedPlayerId || !tempData.targetPlayerId || tempData.selectedPlayerId === tempData.targetPlayerId} 
            onClick={handleTransfer}
          >
            Xác nhận đền
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={modals.editScore} 
        onClose={() => setModals({...modals, editScore: false})}
        title="Chỉnh Sửa Điểm Tuyệt Đối"
      >
        <div className="space-y-4">
          <input type="number" className="text-7xl font-black w-full bg-slate-50 dark:bg-slate-900 p-8 rounded-2xl text-center outline-none text-blue-600" value={tempData.manualScore} onChange={(e) => setTempData({...tempData, manualScore: e.target.value})} autoFocus />
          <Button className="w-full py-4 text-lg font-bold" onClick={handleManualScoreChange}>Lưu Thay Đổi</Button>
        </div>
      </Modal>

      <Modal isOpen={modals.endSession} onClose={() => setModals({...modals, endSession: false})} title="Kết Thúc">
        <div className="space-y-6">
          <p className="text-slate-500">Bạn có chắc chắn muốn kết thúc và xoá dữ liệu phiên chơi này không?</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setModals({...modals, endSession: false})}>Huỷ</Button>
            <Button variant="danger" className="flex-1 font-bold" onClick={() => setView('home')}>Xác Nhận</Button>
          </div>
        </div>
      </Modal>

      {!currentSet && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xs px-4">
           <Button disabled={session.players.length < 2} className="w-full py-5 rounded-2xl shadow-2xl flex items-center justify-center gap-2 text-xl font-black uppercase tracking-tighter" onClick={startNewSet}>
             <Plus size={28}/> Bắt Đầu Ván Mới
           </Button>
        </div>
      )}
    </div>
  );
}
