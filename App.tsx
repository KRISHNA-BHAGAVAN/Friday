import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Task, FilterType, SubTask, Reminder } from './types';
import TaskItem from './components/TaskItem';
import { analyzeTask } from './services/geminiService';

const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('gemini-tasks');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [filter, setFilter] = useState<FilterType>(FilterType.ALL);
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem('gemini-tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Request notification permissions on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Check for due reminders every 30 seconds
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      
      setTasks(currentTasks => {
        let hasChanges = false;
        const updatedTasks = currentTasks.map(task => {
          if (task.completed || !task.reminder || task.reminder.hasNotified) return task;
          
          const dueTime = new Date(task.reminder.isoString).getTime();
          // Trigger if time is passed or within the last minute (to capture exact triggers)
          if (now >= dueTime) {
            // Trigger Notification
            if (Notification.permission === 'granted') {
              new Notification(`Reminder: ${task.text}`, {
                body: `It's time for: ${task.text}`,
                icon: '/icon.png' // Optional: would need a real asset
              });
            }
            hasChanges = true;
            return {
              ...task,
              reminder: {
                ...task.reminder,
                hasNotified: true
              }
            };
          }
          return task;
        });
        
        return hasChanges ? updatedTasks : currentTasks;
      });
    };

    const intervalId = setInterval(checkReminders, 30000); // Check every 30s
    return () => clearInterval(intervalId);
  }, []);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Ask for permission if not yet decided on first add
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    const rawInput = inputValue.trim();
    const tempId = crypto.randomUUID();
    
    // Optimistic UI update - Initial State
    const tempTask: Task = {
      id: tempId,
      text: rawInput,
      completed: false,
      createdAt: Date.now(),
      subtasks: [],
      category: '...',
    };

    setTasks(prev => [tempTask, ...prev]);
    setInputValue('');
    setIsAdding(true);

    try {
        // AI Analysis for text cleanup, category, and reminders
        const analysis = await analyzeTask(rawInput);
        
        setTasks(prev => prev.map(t => 
            t.id === tempId ? { 
              ...t, 
              text: analysis.text,
              category: analysis.category,
              reminder: analysis.reminder
            } : t
        ));
    } catch (error) {
        // Fallback to basic task
        setTasks(prev => prev.map(t => 
            t.id === tempId ? { ...t, category: '📝' } : t
        ));
    } finally {
        setIsAdding(false);
    }
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      
      const newCompleted = !task.completed;
      
      // Handle Recurring Logic
      if (newCompleted && task.reminder?.recurrence) {
         // Calculate next date based on recurrence
         const currentDue = new Date(task.reminder.isoString);
         let nextDue = new Date(currentDue);
         
         switch(task.reminder.recurrence) {
             case 'daily': nextDue.setDate(currentDue.getDate() + 1); break;
             case 'weekly': nextDue.setDate(currentDue.getDate() + 7); break;
             case 'monthly': nextDue.setMonth(currentDue.getMonth() + 1); break;
             case 'yearly': nextDue.setFullYear(currentDue.getFullYear() + 1); break;
         }
         
         // Don't mark as completed, just push date forward
         return {
             ...task,
             completed: false,
             reminder: {
                 ...task.reminder,
                 isoString: nextDue.toISOString(),
                 hasNotified: false
             }
         };
      }

      return { ...task, completed: newCompleted };
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  const updateSubtasks = (taskId: string, subtasks: SubTask[]) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, subtasks } : task
    ));
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const newSubtasks = task.subtasks.map(st => 
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      );
      return { ...task, subtasks: newSubtasks };
    }));
  };

  const updateTask = (id: string, newText: string) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, text: newText } : task
    ));
  };

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case FilterType.ACTIVE:
        return tasks.filter(t => !t.completed);
      case FilterType.COMPLETED:
        return tasks.filter(t => t.completed);
      default:
        return tasks;
    }
  }, [tasks, filter]);

  const activeCount = tasks.filter(t => !t.completed).length;

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-slate-50 relative shadow-2xl overflow-hidden md:rounded-3xl md:h-[95vh] md:my-[2.5vh] md:border border-slate-200">
      
      {/* Header */}
      <header className="px-6 pt-10 pb-6 bg-white z-10 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Tasks</h1>
                <p className="text-slate-500 text-sm mt-1">
                    {activeCount === 0 ? "All caught up! 🎉" : `You have ${activeCount} active tasks`}
                </p>
            </div>
            <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold shadow-inner">
                {new Date().getDate()}
            </div>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="px-6 pb-4 bg-white border-b border-slate-100 flex gap-4 overflow-x-auto no-scrollbar flex-shrink-0">
        {(Object.values(FilterType) as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm font-medium px-4 py-2 rounded-full transition-all duration-200 whitespace-nowrap ${
              filter === f 
                ? 'bg-slate-900 text-white shadow-md shadow-slate-300' 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Task List */}
      <main className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth pb-24">
        {filteredTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
             <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4 text-3xl">
                {filter === FilterType.COMPLETED ? '✓' : '📝'}
             </div>
             <p>No {filter.toLowerCase()} tasks found</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onUpdateSubtasks={updateSubtasks}
              onToggleSubtask={toggleSubtask}
              onUpdateTask={updateTask}
            />
          ))
        )}
      </main>

      {/* Input Area (Sticky Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pt-10">
        <form 
            onSubmit={handleAddTask} 
            className={`relative flex items-center gap-2 bg-white p-2 rounded-2xl shadow-xl border border-slate-100 transition-transform duration-200 ${isAdding ? 'scale-[0.99] opacity-90' : ''}`}
        >
          <div className="pl-3 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Add a task (e.g., 'Daily standup at 10am')"
            className="flex-1 py-3 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-lg"
          />
          <button 
            type="submit"
            disabled={!inputValue.trim()}
            className="bg-indigo-600 text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default App;