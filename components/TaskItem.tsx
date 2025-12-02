import React, { useState, useRef, useEffect } from 'react';
import { Task, SubTask } from '../types';
import { breakDownTask } from '../services/geminiService';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateSubtasks: (taskId: string, subtasks: SubTask[]) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ 
  task, 
  onToggle, 
  onDelete, 
  onUpdateSubtasks,
  onToggleSubtask 
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Manual entry states
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSubtaskId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingSubtaskId]);

  const handleAiBreakdown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.subtasks.length > 0) {
      setIsExpanded(!isExpanded);
      return;
    }

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
    } catch (err) {
      console.error(err);
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
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    const updated = task.subtasks.filter(st => st.id !== subtaskId);
    onUpdateSubtasks(task.id, updated);
  };

  const startEditing = (subtask: SubTask) => {
    setEditingSubtaskId(subtask.id);
    setEditingText(subtask.text);
  };

  const saveEditing = () => {
    if (editingSubtaskId) {
      if (editingText.trim()) {
        const updated = task.subtasks.map(st => 
          st.id === editingSubtaskId ? { ...st, text: editingText.trim() } : st
        );
        onUpdateSubtasks(task.id, updated);
      }
      setEditingSubtaskId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEditing();
    } else if (e.key === 'Escape') {
      setEditingSubtaskId(null);
    }
  };

  const completedSubtasks = task.subtasks.filter(st => st.completed).length;
  const totalSubtasks = task.subtasks.length;
  const progress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

  return (
    <div className={`group bg-white rounded-xl shadow-sm border border-slate-100 mb-3 transition-all duration-300 ${task.completed ? 'opacity-60' : 'hover:shadow-md'}`}>
      <div className="p-4 flex items-start gap-3">
        {/* Main Checkbox */}
        <button
          onClick={() => onToggle(task.id)}
          className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ${
            task.completed 
              ? 'bg-indigo-500 border-indigo-500 text-white' 
              : 'border-slate-300 hover:border-indigo-400'
          }`}
          aria-label={task.completed ? "Mark as incomplete" : "Mark as complete"}
        >
          {task.completed && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-base font-medium truncate cursor-pointer select-none transition-all ${task.completed ? 'text-slate-400 line-through decoration-slate-400' : 'text-slate-800'}`}>
              {task.text}
            </span>
          </div>
          
          {/* Metadata Row */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
             {task.category && <span>{task.category}</span>}
             {totalSubtasks > 0 && (
               <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-full">
                 <div className="w-10 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                   <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                 </div>
                 <span>{completedSubtasks}/{totalSubtasks}</span>
               </div>
             )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* AI/Expand Button */}
          <button
            onClick={handleAiBreakdown}
            disabled={isGenerating}
            className={`p-2 rounded-full transition-colors ${
              task.subtasks.length > 0 
                ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' 
                : 'text-indigo-500 hover:bg-indigo-50'
            }`}
            title={task.subtasks.length > 0 ? "Toggle Subtasks" : "AI Breakdown"}
          >
             {isGenerating ? (
               <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
             ) : task.subtasks.length > 0 ? (
               <svg className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
               </svg>
             ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
             )}
          </button>
          
          {/* Delete Button */}
          <button 
            onClick={() => onDelete(task.id)}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Delete task"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Subtasks Section */}
      <div 
        className={`bg-slate-50 border-t border-slate-100 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-4 pt-2 pb-4 space-y-2">
          {isGenerating && (
            <div className="flex items-center gap-2 text-sm text-indigo-600 animate-pulse py-2">
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
               </svg>
               <span>Gemini is generating subtasks...</span>
            </div>
          )}
          
          {!isGenerating && (
            <>
              {task.subtasks.map(subtask => (
                <div key={subtask.id} className="flex items-center gap-3 pl-2 pr-1 min-h-[32px]">
                  <button
                    onClick={() => onToggleSubtask(task.id, subtask.id)}
                    className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      subtask.completed 
                        ? 'bg-slate-400 border-slate-400 text-white' 
                        : 'border-slate-300 bg-white hover:border-indigo-400'
                    }`}
                  >
                    {subtask.completed && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    {editingSubtaskId === subtask.id ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={saveEditing}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-white border border-indigo-300 rounded px-2 py-0.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    ) : (
                      <span 
                        onClick={() => startEditing(subtask)}
                        className={`text-sm block cursor-text truncate ${subtask.completed ? 'text-slate-400 line-through' : 'text-slate-600 hover:text-slate-900'}`}
                        title="Click to edit"
                      >
                        {subtask.text}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteSubtask(subtask.id)}
                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                    title="Delete subtask"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Add Subtask Form */}
              <form onSubmit={handleAddSubtask} className="pl-2 mt-2 flex items-center gap-2">
                <div className="w-4 h-4 flex items-center justify-center text-slate-300">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={newSubtaskText}
                  onChange={(e) => setNewSubtaskText(e.target.value)}
                  placeholder="Add a step..."
                  className="flex-1 bg-transparent text-sm placeholder:text-slate-400 text-slate-700 outline-none border-b border-transparent focus:border-indigo-200 transition-colors py-1"
                />
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskItem;