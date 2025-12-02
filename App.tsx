
import React, { useState, useEffect, useMemo } from 'react';
import { Task, AppSection, SubTask, Reminder } from './types';
import TaskItem from './components/TaskItem';
import { analyzeTask } from './services/geminiService';

// Simple beep sound generator
const playAlarmSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime); 
        osc.frequency.setValueAtTime(1760, ctx.currentTime + 0.1); 
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio play failed", e);
    }
};

const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('gemini-tasks');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activeSection, setActiveSection] = useState<AppSection>(AppSection.TASKS);
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem('gemini-tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Request notification permissions
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Reminder Checker Loop
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      
      setTasks(currentTasks => {
        let hasChanges = false;
        const updatedTasks = currentTasks.map(task => {
          if (task.completed || !task.reminder || task.reminder.hasNotified) return task;
          
          const dueTime = new Date(task.reminder.isoString).getTime();
          if (now >= dueTime) {
            if (Notification.permission === 'granted') {
              new Notification(`Reminder: ${task.text}`, {
                body: `It's time for: ${task.text}`,
                icon: '/icon.png' 
              });
            }
            if (task.reminder.type === 'alarm') {
                playAlarmSound();
            }
            hasChanges = true;
            return { ...task, reminder: { ...task.reminder, hasNotified: true } };
          }
          return task;
        });
        return hasChanges ? updatedTasks : currentTasks;
      });
    };

    const intervalId = setInterval(checkReminders, 15000); 
    return () => clearInterval(intervalId);
  }, []);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    const rawInput = inputValue.trim();
    const tempId = crypto.randomUUID();
    
    // Initial Optimistic Task
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
        const analysis = await analyzeTask(rawInput);
        
        setTasks(prev => prev.map(t => 
            t.id === tempId ? { 
              ...t, 
              text: analysis.text,
              category: analysis.category,
              reminder: analysis.reminder
            } : t
        ));
        
        // Auto-switch tab if the user added a specific type of item
        if (analysis.reminder?.recurrence === 'yearly') {
            setActiveSection(AppSection.BIRTHDAYS);
        } else if (analysis.reminder) {
            setActiveSection(AppSection.REMINDERS);
        } else {
            setActiveSection(AppSection.TASKS);
        }

    } catch (error) {
        setTasks(prev => prev.map(t => t.id === tempId ? { ...t, category: '📝' } : t));
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
         const currentDue = new Date(task.reminder.isoString);
         let nextDue = new Date(currentDue);
         
         switch(task.reminder.recurrence) {
             case 'daily': nextDue.setDate(currentDue.getDate() + 1); break;
             case 'weekly': nextDue.setDate(currentDue.getDate() + 7); break;
             case 'monthly': nextDue.setMonth(currentDue.getMonth() + 1); break;
             case 'yearly': nextDue.setFullYear(currentDue.getFullYear() + 1); break;
         }
         
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
    setTasks(prev => prev.map(task => task.id === taskId ? { ...task, subtasks } : task));
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
    setTasks(prev => prev.map(task => task.id === id ? { ...task, text: newText } : task));
  };

  const updateReminder = (id: string, reminder?: Reminder) => {
    setTasks(prev => prev.map(task => task.id === id ? { ...task, reminder } : task));
  };

  // Section Filtering & Sorting
  const filteredTasks = useMemo(() => {
    let filtered: Task[] = [];
    
    switch (activeSection) {
        case AppSection.TASKS:
            // Tasks with NO reminder, or reminders that aren't recurring yearly/monthly/weekly (just standard deadlines maybe?)
            // Simplest separation: No reminder = Task. Reminder = Reminder section.
            // But strict "No reminder" might hide tasks that just have a deadline. 
            // Let's say: Reminders section is for things with Recurrence OR explicit Alerts.
            // Tasks section is for standard To-Dos. 
            // For now, Strict: No reminder object = Task.
            filtered = tasks.filter(t => !t.reminder);
            // Sort active first, then by creation
            return filtered.sort((a, b) => (Number(a.completed) - Number(b.completed)) || (b.createdAt - a.createdAt));
            
        case AppSection.REMINDERS:
            // Has reminder, NOT yearly recurrence (Birthday)
            filtered = tasks.filter(t => t.reminder && t.reminder.recurrence !== 'yearly');
            // Sort by Date
            return filtered.sort((a, b) => new Date(a.reminder!.isoString).getTime() - new Date(b.reminder!.isoString).getTime());
            
        case AppSection.BIRTHDAYS:
            // Yearly recurrence
            filtered = tasks.filter(t => t.reminder?.recurrence === 'yearly');
            // Sort by Date (Month/Day) - Need to normalize years to compare upcoming
            return filtered.sort((a, b) => {
                const dateA = new Date(a.reminder!.isoString);
                const dateB = new Date(b.reminder!.isoString);
                // Reset year to current to compare active months
                dateA.setFullYear(2000);
                dateB.setFullYear(2000);
                return dateA.getTime() - dateB.getTime();
            });
            
        default:
            return [];
    }
  }, [tasks, activeSection]);

  const getSectionTitle = () => {
      switch(activeSection) {
          case AppSection.TASKS: return "My Tasks";
          case AppSection.REMINDERS: return "Reminders";
          case AppSection.BIRTHDAYS: return "Birthdays";
      }
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-slate-50 relative shadow-2xl overflow-hidden md:rounded-3xl md:h-[95vh] md:my-[2.5vh] md:border border-slate-200 font-sans">
      
      {/* Header */}
      <header className="px-6 pt-10 pb-2 bg-white z-10 flex-shrink-0 transition-colors duration-300">
        <div className="flex items-center justify-between mb-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight transition-all duration-300">
                    {getSectionTitle()}
                </h1>
                <p className="text-slate-400 text-xs mt-1 font-medium tracking-wide">
                    {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
            </div>
            {activeSection === AppSection.BIRTHDAYS ? (
                <div className="h-10 w-10 bg-pink-100 rounded-xl flex items-center justify-center text-xl shadow-sm">
                    🎂
                </div>
            ) : (
                <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold shadow-sm">
                    {filteredTasks.filter(t => !t.completed).length}
                </div>
            )}
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-6 border-b border-slate-100 pb-px">
            <button 
                onClick={() => setActiveSection(AppSection.TASKS)}
                className={`pb-3 text-sm font-medium transition-all duration-200 relative ${activeSection === AppSection.TASKS ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Tasks
                {activeSection === AppSection.TASKS && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full"></div>}
            </button>
            <button 
                onClick={() => setActiveSection(AppSection.REMINDERS)}
                className={`pb-3 text-sm font-medium transition-all duration-200 relative ${activeSection === AppSection.REMINDERS ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Reminders
                {activeSection === AppSection.REMINDERS && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full"></div>}
            </button>
            <button 
                onClick={() => setActiveSection(AppSection.BIRTHDAYS)}
                className={`pb-3 text-sm font-medium transition-all duration-200 relative ${activeSection === AppSection.BIRTHDAYS ? 'text-pink-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Birthdays
                {activeSection === AppSection.BIRTHDAYS && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-pink-600 rounded-t-full"></div>}
            </button>
        </nav>
      </header>

      {/* Task List */}
      <main className="flex-1 overflow-y-auto px-5 py-6 scroll-smooth pb-28 bg-slate-50/50">
        {filteredTasks.length === 0 ? (
          <div className="h-[60%] flex flex-col items-center justify-center text-slate-300">
             <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl opacity-50 ${activeSection === AppSection.BIRTHDAYS ? 'bg-pink-100 text-pink-300' : 'bg-slate-100'}`}>
                {activeSection === AppSection.BIRTHDAYS ? '🎈' : (activeSection === AppSection.REMINDERS ? '⏰' : '📝')}
             </div>
             <p className="text-sm font-medium">
                 {activeSection === AppSection.TASKS && "No tasks yet"}
                 {activeSection === AppSection.REMINDERS && "No upcoming reminders"}
                 {activeSection === AppSection.BIRTHDAYS && "No birthdays added"}
             </p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              isBirthday={activeSection === AppSection.BIRTHDAYS}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onUpdateSubtasks={updateSubtasks}
              onToggleSubtask={toggleSubtask}
              onUpdateTask={updateTask}
              onUpdateReminder={updateReminder}
            />
          ))
        )}
      </main>

      {/* Input Area (Sticky Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8 z-20">
        <form 
            onSubmit={handleAddTask} 
            className={`relative flex items-center gap-2 bg-white p-2 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100 transition-transform duration-200 ${isAdding ? 'scale-[0.99] opacity-90' : ''}`}
        >
          <div className={`pl-3 ${activeSection === AppSection.BIRTHDAYS ? 'text-pink-400' : 'text-indigo-400'}`}>
             {activeSection === AppSection.BIRTHDAYS ? (
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
             )}
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
                activeSection === AppSection.TASKS ? "Add a new task..." :
                activeSection === AppSection.REMINDERS ? "Set a reminder (e.g. Call Mom at 5pm)" :
                "Add a birthday..."
            }
            className="flex-1 py-3 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-lg"
          />
          <button 
            type="submit"
            disabled={!inputValue.trim()}
            className={`p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg text-white
                ${activeSection === AppSection.BIRTHDAYS ? 'bg-pink-500 hover:bg-pink-600 shadow-pink-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}
            `}
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
