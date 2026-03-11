import { XCircle } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] sm:max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-base sm:text-lg text-slate-800 dark:text-white truncate">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full cursor-pointer text-slate-500 dark:text-slate-400 shrink-0">
            <XCircle size={24} />
          </button>
        </div>
        <div className="p-3 sm:p-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
