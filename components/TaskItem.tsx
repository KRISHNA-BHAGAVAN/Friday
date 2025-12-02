import React, { useState, useRef, useEffect } from 'react';
import { Task, SubTask } from '../types';
import { breakDownTask } from '../services/geminiService';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateSubtasks: (taskId: string, subtasks: SubTask[]) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (id: string, newText: string) => void;
}

const formatReminderDate = (isoString: string) => {
  const date = new Date(isoString);
  const now = new Date();
  // Reset time for date comparison
  const today = new Date();
  today.setHours(0,0,0,0);
  const checkDate = new Date(date);
  checkDate.setHours(0,0,0,0);
  
  const isToday = checkDate.getTime() === today.getTime();
  const tmrw = new Date(today);
  tmrw.setDate(tmrw.getDate() + 1);
  const isTomorrow = checkDate.getTime() === tmrw.getTime();
  
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `Today, ${timeStr}`;
  if (isTomorrow) return `Tomorrow, ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
};

const TaskItem: React.FC<TaskItemProps> = ({ 
  task, 
  onToggle, 
  onDelete, 
  onUpdateSubtasks, 
  onToggleSubtask,
  onUpdateTask
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  
  // Manual subtask input
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);

  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [isEditing]);

  const handleAiBreakdown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.subtasks.length > 0 || isGenerating) return;

    setIsGenerating(true);
    setIsExpanded(true); // Auto expand to show loading state

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

    const newSub: SubTask = {
        id: crypto.randomUUID(),
        text: newSubtaskText.trim(),
        completed: false
    };

    onUpdateSubtasks(task.id, [...task.subtasks, newSub]);
    setNewSubtaskText('');
    setIsAddingSubtask(false);
  };

  const handleDeleteSubtask = (subtaskId: string) => {
      onUpdateSubtasks(task.id, task.subtasks.filter(st => st.id !== subtaskId));
  };

  const handleSaveTitle = () => {
    if (editText.trim() && editText.trim() !== task.text) {
      onUpdateTask(task.id, editText.trim());
    } else {
      setEditText(task.text); // Revert
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setEditText(task.text);
      setIsEditing(false);
    }
  };

  const isOverdue = task.reminder && new Date(task.reminder.isoString).getTime() < Date.now() && !task.completed;

  return (
    <div className={`mb-4 group transition-all duration-300 ${isExpanded ? 'mb-6' : ''}`}>
        <div 
            onClick={() => setIsExpanded(!isExpanded)}
            className={`
                relative bg-white p-4 rounded-2xl border transition-all duration-200 cursor-pointer
                ${task.completed ? 'opacity-60 bg-slate-50 border-transparent shadow-none' : 'border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100'}
                ${isExpanded ? 'ring-2 ring-indigo-50 border-indigo-100 z-10' : ''}
            `}
        >
            <div className="flex items-start gap-4">
                {/* Checkbox */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
                    className={`
                        mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0
                        ${task.completed 
                            ? 'bg-indigo-500 border-indigo-500 text-white' 
                            : 'border-slate-300 hover:border-indigo-400 text-transparent'}
                    `}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                            {/* Category Badge */}
                            {task.category && (
                                <span className="inline-block text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md mb-1">
                                    {task.category}
                                </span>
                            )}
                            
                            {/* Title (Editable) */}
                            {isEditing ? (
                                <input 
                                    ref={editInputRef}
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onBlur={handleSaveTitle}
                                    onKeyDown={handleKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-lg font-medium text-slate-900 bg-white border-b-2 border-indigo-500 focus:outline-none p-0 rounded-none leading-relaxed"
                                />
                            ) : (
                                <h3 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!task.completed) setIsEditing(true);
                                    }}
                                    className={`
                                        text-lg font-medium text-slate-900 leading-relaxed truncate pr-2
                                        ${task.completed ? 'line-through text-slate-400' : ''}
                                        ${!task.completed && 'hover:text-indigo-600 transition-colors'}
                                    `}
                                    title="Click to edit"
                                >
                                    {task.text}
                                </h3>
                            )}
                        </div>
                        
                        {/* Delete Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                            className="text-slate-300 hover:text-rose-500 transition-colors p-1 -mr-2 opacity-0 group-hover:opacity-100"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    {/* Metadata Row */}
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                        {/* Reminder Badge */}
                        {task.reminder && (
                            <div className={`flex items-center text-xs font-medium ${isOverdue ? 'text-rose-500' : 'text-indigo-500'}`}>
                                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatReminderDate(task.reminder.isoString)}
                                {task.reminder.recurrence && (
                                    <span className="ml-1 bg-indigo-50 px-1.5 rounded text-[10px] uppercase tracking-wider border border-indigo-100">
                                        {task.reminder.recurrence}
                                    </span>
                                )}
                            </div>
                        )}
                        
                        {/* Subtasks Count */}
                        {task.subtasks.length > 0 && (
                            <div className="flex items-center text-xs text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span>
                                {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length} subtasks
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Action Area - Only show if no subtasks yet */}
            {task.subtasks.length === 0 && !task.completed && (
                <div className={`
                    overflow-hidden transition-all duration-300 ease-in-out
                    ${isExpanded ? 'max-h-20 mt-4 opacity-100' : 'max-h-0 opacity-0'}
                `}>
                    <button
                        onClick={handleAiBreakdown}
                        disabled={isGenerating}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-sm font-medium"
                    >
                        {isGenerating ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Breaking down task...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                Break down with AI
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>

        {/* Subtasks List */}
        <div className={`
            pl-4 border-l-2 border-slate-100 ml-6 space-y-3 overflow-hidden transition-all duration-500 ease-in-out
            ${isExpanded && (task.subtasks.length > 0 || isAddingSubtask) ? 'max-h-[500px] mt-4 opacity-100' : 'max-h-0 opacity-0'}
        `}>
            {task.subtasks.map(subtask => (
                <div key={subtask.id} className="flex items-center gap-3 group/sub">
                    <button
                        onClick={() => onToggleSubtask(task.id, subtask.id)}
                        className={`
                            w-5 h-5 rounded border flex items-center justify-center transition-colors
                            ${subtask.completed ? 'bg-indigo-400 border-indigo-400 text-white' : 'border-slate-300 bg-white hover:border-indigo-400'}
                        `}
                    >
                        {subtask.completed && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </button>
                    <span className={`text-sm flex-1 ${subtask.completed ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                        {subtask.text}
                    </span>
                    <button 
                        onClick={() => handleDeleteSubtask(subtask.id)}
                        className="text-slate-300 hover:text-rose-500 opacity-0 group-hover/sub:opacity-100 transition-opacity"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
            
            {/* Add Subtask Button/Form */}
            {isExpanded && (
                <div className="pt-1">
                    {isAddingSubtask ? (
                        <form onSubmit={handleAddSubtask} className="flex gap-2">
                             <input
                                autoFocus
                                type="text"
                                value={newSubtaskText}
                                onChange={(e) => setNewSubtaskText(e.target.value)}
                                placeholder="New subtask..."
                                className="flex-1 text-sm bg-white border border-indigo-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                onKeyDown={(e) => e.key === 'Escape' && setIsAddingSubtask(false)}
                             />
                             <button type="submit" className="text-indigo-600 text-sm font-medium hover:bg-indigo-50 px-2 rounded">
                                 Add
                             </button>
                        </form>
                    ) : (
                        <button 
                            onClick={() => setIsAddingSubtask(true)}
                            className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add subtask
                        </button>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default TaskItem;