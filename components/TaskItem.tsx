
import React, { useState, useRef, useEffect } from 'react';
import { Task, SubTask, Reminder } from '../types';
import { breakDownTask } from '../services/geminiService';

interface TaskItemProps {
  task: Task;
  isBirthday?: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateSubtasks: (taskId: string, subtasks: SubTask[]) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (id: string, newText: string) => void;
  onUpdateReminder: (id: string, reminder?: Reminder) => void;
}

const formatReminderDate = (isoString: string, isBirthday: boolean) => {
  const date = new Date(isoString);
  
  if (isBirthday) {
     return date.toLocaleDateString([], { month: 'long', day: 'numeric' });
  }

  const today = new Date();
  today.setHours(0,0,0,0);
  const checkDate = new Date(date);
  checkDate.setHours(0,0,0,0);
  
  const tmrw = new Date(today);
  tmrw.setDate(tmrw.getDate() + 1);
  const isTomorrow = checkDate.getTime() === tmrw.getTime();
  const isToday = checkDate.getTime() === today.getTime();
  
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  
  if (isToday) return `Today, ${timeStr}`;
  if (isTomorrow) return `Tomorrow, ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
};

const TaskItem: React.FC<TaskItemProps> = ({ 
  task, 
  isBirthday = false,
  onToggle, 
  onDelete, 
  onUpdateSubtasks, 
  onToggleSubtask,
  onUpdateTask,
  onUpdateReminder
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  
  // Manual subtask input
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);

  // Reminder Edit State
  const [showReminderEdit, setShowReminderEdit] = useState(false);
  
  // Split Date/Time state for better UI
  const [editDatePart, setEditDatePart] = useState('');
  const [editTimePart, setEditTimePart] = useState('');
  const [editReminderRecurrence, setEditReminderRecurrence] = useState<string>('none');
  const [editReminderType, setEditReminderType] = useState<'notification' | 'alarm'>('notification');

  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [isEditing]);

  // Initialize reminder edit form when opened
  useEffect(() => {
    if (showReminderEdit) {
        if (task.reminder) {
            const d = new Date(task.reminder.isoString);
            setEditDatePart(d.toISOString().split('T')[0]);
            // Format time as HH:MM for input type="time"
            const hours = d.getHours().toString().padStart(2, '0');
            const minutes = d.getMinutes().toString().padStart(2, '0');
            setEditTimePart(`${hours}:${minutes}`);
            setEditReminderRecurrence(task.reminder.recurrence || 'none');
            setEditReminderType(task.reminder.type || 'notification');
        } else {
            // Default values for new reminder
            const now = new Date();
            // Default to tomorrow 9am if no reminder exists
            now.setDate(now.getDate() + 1);
            setEditDatePart(now.toISOString().split('T')[0]);
            setEditTimePart(isBirthday ? '00:00' : '09:00');
            setEditReminderRecurrence(isBirthday ? 'yearly' : 'none');
            setEditReminderType('notification');
        }
    }
  }, [showReminderEdit, task.reminder, isBirthday]);

  const handleAiBreakdown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.subtasks.length > 0 || isGenerating) return;

    setIsGenerating(true);
    setIsExpanded(true); 

    try {
      const subtaskTexts = await breakDownTask(task.text);
      const newSubtasks: SubTask[] = subtaskTexts.map(text => ({
        id: crypto.randomUUID(),
        text,
        completed: false
      }));
      onUpdateSubtasks(task.id, newSubtasks);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskText.trim()) return;
    
    const newSubtask: SubTask = {
      id: crypto.randomUUID(),
      text: newSubtaskText.trim(),
      completed: false
    };
    
    onUpdateSubtasks(task.id, [...task.subtasks, newSubtask]);
    setNewSubtaskText('');
    setIsAddingSubtask(false);
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    onUpdateSubtasks(task.id, task.subtasks.filter(st => st.id !== subtaskId));
  };

  const handleTextEditSubmit = () => {
      if (editText.trim() !== task.text) {
          onUpdateTask(task.id, editText.trim());
      }
      setIsEditing(false);
  };

  const handleReminderSave = () => {
      if (!editDatePart) return;

      const dateObj = new Date(editDatePart);
      const [hours, minutes] = editTimePart.split(':').map(Number);
      dateObj.setHours(hours || 0, minutes || 0, 0, 0);

      const newReminder: Reminder = {
          isoString: dateObj.toISOString(),
          recurrence: editReminderRecurrence === 'none' ? undefined : editReminderRecurrence as any,
          type: editReminderType,
          hasNotified: false
      };

      onUpdateReminder(task.id, newReminder);
      setShowReminderEdit(false);
  };

  const handleQuickDate = (offsetDays: number, setTime?: string) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      setEditDatePart(d.toISOString().split('T')[0]);
      if (setTime) setEditTimePart(setTime);
  };

  const isOverdue = task.reminder && !task.completed && new Date(task.reminder.isoString).getTime() < Date.now();

  return (
    <div 
        className={`group mb-3 rounded-2xl transition-all duration-300 border border-transparent
        ${isExpanded ? 'bg-white shadow-xl ring-1 ring-slate-100' : 'bg-white hover:shadow-md hover:border-slate-100 shadow-sm'}
        `}
    >
      {/* Main Task Row */}
      <div 
        className="p-4 flex items-start gap-3 cursor-pointer select-none"
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
          className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0
            ${task.completed 
              ? 'bg-indigo-500 border-indigo-500 text-white scale-110' 
              : 'border-slate-300 hover:border-indigo-400 text-transparent'}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            {isEditing ? (
                <input 
                    ref={editInputRef}
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={handleTextEditSubmit}
                    onKeyDown={(e) => e.key === 'Enter' && handleTextEditSubmit()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-slate-50 border border-indigo-200 rounded px-2 py-0.5 outline-none text-slate-800 font-medium"
                />
            ) : (
                <h3 
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                    }}
                    className={`font-medium text-lg leading-tight transition-all duration-300 truncate pr-2 hover:text-indigo-600
                    ${task.completed ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800'}`}
                >
                    {task.text}
                </h3>
            )}
            
            <span className="text-xl leading-none opacity-80 filter grayscale group-hover:grayscale-0 transition-all">
                {task.category}
            </span>
          </div>
          
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {task.reminder && (
                <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium
                    ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}
                `}>
                    {task.reminder.type === 'alarm' ? '⏰' : (task.reminder.recurrence ? '🔁' : '📅')}
                    <span>{formatReminderDate(task.reminder.isoString, isBirthday)}</span>
                </div>
            )}
            
            {task.subtasks.length > 0 && (
              <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                {task.subtasks.filter(t => t.completed).length}/{task.subtasks.length} subtasks
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <hr className="border-slate-100 mb-4" />
            
            {/* Reminder Settings Panel */}
            {showReminderEdit ? (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 shadow-inner">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {isBirthday ? 'Birthday Details' : 'Reminder Settings'}
                        </h4>
                        <button onClick={() => setShowReminderEdit(false)} className="text-slate-400 hover:text-slate-600">
                             ✕
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="text-xs text-slate-500 font-medium mb-1 block">Date</label>
                            <input 
                                type="date" 
                                value={editDatePart}
                                onChange={(e) => setEditDatePart(e.target.value)}
                                className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>
                        {!isBirthday && (
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-xs text-slate-500 font-medium mb-1 block">Time</label>
                                <input 
                                    type="time" 
                                    value={editTimePart}
                                    onChange={(e) => setEditTimePart(e.target.value)}
                                    className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                            </div>
                        )}
                    </div>

                    {/* Quick Date Chips */}
                    {!isBirthday && (
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                            <button type="button" onClick={() => handleQuickDate(1, '09:00')} className="px-3 py-1 bg-white border border-slate-200 text-xs rounded-full text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors whitespace-nowrap">
                                🌅 Tmrw Morn
                            </button>
                            <button type="button" onClick={() => handleQuickDate(1, '18:00')} className="px-3 py-1 bg-white border border-slate-200 text-xs rounded-full text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors whitespace-nowrap">
                                🌙 Tmrw Eve
                            </button>
                            <button type="button" onClick={() => handleQuickDate(7)} className="px-3 py-1 bg-white border border-slate-200 text-xs rounded-full text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors whitespace-nowrap">
                                📅 Next Wk
                            </button>
                        </div>
                    )}

                    <div className="flex gap-3 mb-4">
                        <div className="flex-1">
                             <label className="text-xs text-slate-500 font-medium mb-1 block">Repeat</label>
                             <select 
                                value={editReminderRecurrence}
                                onChange={(e) => setEditReminderRecurrence(e.target.value)}
                                className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none"
                             >
                                 <option value="none">No Repeat</option>
                                 <option value="daily">Daily</option>
                                 <option value="weekly">Weekly</option>
                                 <option value="monthly">Monthly</option>
                                 <option value="yearly">Yearly</option>
                             </select>
                        </div>
                        {!isBirthday && (
                            <div className="flex-1">
                                <label className="text-xs text-slate-500 font-medium mb-1 block">Mode</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button 
                                        onClick={() => setEditReminderType('notification')}
                                        className={`flex-1 py-1.5 text-xs rounded-md transition-all ${editReminderType === 'notification' ? 'bg-white shadow text-indigo-600 font-medium' : 'text-slate-500'}`}
                                    >
                                        🔔 Notify
                                    </button>
                                    <button 
                                        onClick={() => setEditReminderType('alarm')}
                                        className={`flex-1 py-1.5 text-xs rounded-md transition-all ${editReminderType === 'alarm' ? 'bg-white shadow text-indigo-600 font-medium' : 'text-slate-500'}`}
                                    >
                                        ⏰ Alarm
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                        <button 
                             onClick={() => {
                                 onUpdateReminder(task.id, undefined);
                                 setShowReminderEdit(false);
                             }}
                             className="text-red-500 text-sm font-medium hover:text-red-600 px-2"
                        >
                            Remove
                        </button>
                        <button 
                            onClick={handleReminderSave}
                            className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            ) : null}

          {/* Subtasks Section */}
          <div className="space-y-2">
            {task.subtasks.map(subtask => (
              <div key={subtask.id} className="flex items-start gap-3 pl-2 group/sub">
                <button
                  onClick={() => onToggleSubtask(task.id, subtask.id)}
                  className={`mt-1 w-4 h-4 rounded border transition-colors flex items-center justify-center
                    ${subtask.completed ? 'bg-slate-400 border-slate-400 text-white' : 'border-slate-300 hover:border-indigo-400 text-transparent'}`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <span className={`text-sm flex-1 transition-colors ${subtask.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {subtask.text}
                </span>
                <button 
                    onClick={() => handleDeleteSubtask(subtask.id)}
                    className="opacity-0 group-hover/sub:opacity-100 text-slate-300 hover:text-red-400 transition-opacity"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-50">
            {!task.reminder && !showReminderEdit && (
                <button 
                    onClick={() => setShowReminderEdit(true)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Add Reminder
                </button>
            )}
            
            {task.reminder && !showReminderEdit && (
                 <button 
                    onClick={() => setShowReminderEdit(true)}
                    className="text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit Reminder
                </button>
            )}

            {!isBirthday && (
                <button
                    onClick={handleAiBreakdown}
                    disabled={isGenerating || task.subtasks.length > 0}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5
                        ${task.subtasks.length > 0 
                            ? 'text-slate-400 cursor-default' 
                            : 'text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100'}
                    `}
                >
                    {isGenerating ? (
                        <>
                        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Thinking...
                        </>
                    ) : (
                        <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        Break Down
                        </>
                    )}
                </button>
            )}

            {isAddingSubtask ? (
                <form onSubmit={handleAddSubtask} className="flex-1 flex gap-2">
                    <input 
                        type="text" 
                        autoFocus
                        placeholder="Type subtask..."
                        value={newSubtaskText}
                        onChange={e => setNewSubtaskText(e.target.value)}
                        className="flex-1 text-xs px-2 py-1 bg-white border border-slate-300 rounded focus:border-indigo-500 outline-none"
                    />
                    <button type="submit" className="text-xs font-bold text-indigo-600">Add</button>
                    <button type="button" onClick={() => setIsAddingSubtask(false)} className="text-xs text-slate-400">Cancel</button>
                </form>
            ) : (
                <button 
                    onClick={() => setIsAddingSubtask(true)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg transition-colors"
                >
                    + Subtask
                </button>
            )}

            <div className="flex-1"></div>

            <button
              onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
              className="text-slate-400 hover:text-red-500 p-1.5 transition-colors"
              title="Delete Task"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskItem;
