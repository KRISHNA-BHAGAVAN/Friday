import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Task, AppSection, SubTask, Reminder } from './types';
import TaskItem from './components/TaskItem';
import { analyzeTask } from './services/geminiService';

// --- AUDIO ENGINE ---
// We use a global ref pattern or lazy initialization to satisfy browser autoplay policies.
// The context must be resumed/created after a user gesture.
let audioCtx: AudioContext | null = null;

const initAudioEngine = () => {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
    // Always try to resume if suspended (common on Chrome/iOS)
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

const playAlarmSound = () => {
    if (!audioCtx) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        // Alarm sound: High pitch alert
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        osc.frequency.setValueAtTime(1760, audioCtx.currentTime + 0.1); // A6
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2); // A5
        osc.frequency.setValueAtTime(1760, audioCtx.currentTime + 0.3); // A6
        
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.8);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.8);
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
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'default'
  );
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    localStorage.setItem('gemini-tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Handle PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    });
  };

  const requestNotificationPermission = async () => {
      if (!('Notification' in window)) return;
      const result = await Notification.requestPermission();
      setPermissionStatus(result);
      if (result === 'granted') {
          new Notification("Notifications Enabled", {
              body: "You will now receive task reminders!",
              icon: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4dd/128.png'
          });
      }
  };

  // Helper to "wake up" capabilities on interaction
  const handleUserInteraction = () => {
      initAudioEngine();
      if (permissionStatus === 'default') {
          requestNotificationPermission();
      }
  };

  // --- BACKGROUND TIMER WORKER ---
  // Using a Web Worker prevents the timer from being throttled when the tab is inactive
  useEffect(() => {
    // 1. Define the check logic (runs on main thread when worker ticks)
    const checkReminders = () => {
      const now = Date.now();
      
      setTasks(currentTasks => {
        let hasChanges = false;
        const updatedTasks = currentTasks.map(task => {
          if (task.completed || !task.reminder || task.reminder.hasNotified) return task;
          
          const dueTime = new Date(task.reminder.isoString).getTime();
          // Check if due (with a 1-minute window flexibility)
          if (now >= dueTime) {
            
            // Trigger Notification
            if (Notification.permission === 'granted') {
              try {
                  // We use the ServiceWorkerRegistration if available for more robust mobile notifications
                  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                      navigator.serviceWorker.ready.then(registration => {
                          registration.showNotification(task.reminder?.type === 'alarm' ? '🚨 Alarm' : '🔔 Reminder', {
                              body: task.text,
                              icon: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4dd/128.png',
                              tag: task.id,
                              renotify: true,
                              requireInteraction: task.reminder?.type === 'alarm',
                              data: { url: window.location.href } // Data for click handler
                          } as any);
                      });
                  } else {
                      // Fallback to standard API
                      new Notification(task.reminder?.type === 'alarm' ? '🚨 Alarm' : '🔔 Reminder', {
                        body: task.text,
                        icon: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4dd/128.png',
                        tag: task.id,
                        requireInteraction: task.reminder?.type === 'alarm',
                      });
                  }
              } catch (e) {
                  console.error("Notification failed", e);
              }
            }
            
            // Trigger Audio
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

    // 2. Create Inline Worker
    const workerCode = `
        self.onmessage = function() {
            setInterval(() => {
                self.postMessage('TICK');
            }, 10000); // Check every 10s
        };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    // 3. Listen for ticks
    worker.onmessage = () => {
        checkReminders();
    };

    // 4. Start worker
    worker.postMessage('START');

    return () => worker.terminate();
  }, []); // Only setup worker once

  // Experimental: Schedule Native Notification (Best effort for 'Killed' state support)
  const scheduleNativeNotification = (task: Task) => {
    if (!task.reminder || !('showTrigger' in Notification.prototype)) return;
    
    const timestamp = new Date(task.reminder.isoString).getTime();
    if (timestamp < Date.now()) return;

    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(task.text, {
                tag: task.id,
                body: task.reminder?.type === 'alarm' ? '🚨 Alarm' : '🔔 Reminder',
                icon: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4dd/128.png',
                showTrigger: new (window as any).TimestampTrigger(timestamp)
            } as any);
        }).catch(err => console.log('Scheduled notification not supported', err));
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    handleUserInteraction(); // Unlock audio/notifications
    
    if (!inputValue.trim()) return;

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
        
        setTasks(prev => {
            const newTasks = prev.map(t => 
                t.id === tempId ? { 
                  ...t, 
                  text: analysis.text,
                  category: analysis.category,
                  reminder: analysis.reminder
                } : t
            );
            
            // Try to schedule native notification if available
            const updatedTask = newTasks.find(t => t.id === tempId);
            if (updatedTask && updatedTask.reminder) {
                scheduleNativeNotification(updatedTask);
            }
            return newTasks;
        });
        
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
    handleUserInteraction();
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
         
         const nextTask = {
             ...task,
             completed: false,
             reminder: {
                 ...task.reminder,
                 isoString: nextDue.toISOString(),
                 hasNotified: false
             }
         };
         scheduleNativeNotification(nextTask);
         return nextTask;
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
    setTasks(prev => {
        const newTasks = prev.map(task => task.id === id ? { ...task, reminder } : task);
        const updated = newTasks.find(t => t.id === id);
        if (updated && updated.reminder) {
            scheduleNativeNotification(updated);
        }
        return newTasks;
    });
  };

  // Section Filtering & Sorting
  const filteredTasks = useMemo(() => {
    let filtered: Task[] = [];
    
    switch (activeSection) {
        case AppSection.TASKS:
            filtered = tasks.filter(t => !t.reminder);
            return filtered.sort((a, b) => (Number(a.completed) - Number(b.completed)) || (b.createdAt - a.createdAt));
            
        case AppSection.REMINDERS:
            filtered = tasks.filter(t => t.reminder && t.reminder.recurrence !== 'yearly');
            return filtered.sort((a, b) => new Date(a.reminder!.isoString).getTime() - new Date(b.reminder!.isoString).getTime());
            
        case AppSection.BIRTHDAYS:
            filtered = tasks.filter(t => t.reminder?.recurrence === 'yearly');
            return filtered.sort((a, b) => {
                const dateA = new Date(a.reminder!.isoString);
                const dateB = new Date(b.reminder!.isoString);
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
    <div className="flex flex-col h-full max-w-md mx-auto bg-slate-50 relative shadow-2xl overflow-hidden md:rounded-3xl md:h-[95vh] md:my-[2.5vh] md:border border-slate-200 font-sans" onClick={handleUserInteraction}>
      
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
            
            <div className="flex items-center gap-2">
                {installPrompt && (
                   <button
                     onClick={handleInstallClick}
                     className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
                   >
                     Install App
                   </button>
                )}
                {permissionStatus !== 'granted' && (
                    <button 
                        onClick={requestNotificationPermission}
                        className="h-10 w-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center animate-pulse"
                        title="Enable Notifications"
                    >
                        🔔
                    </button>
                )}
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
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-6 border-b border-slate-100 pb-px">
            <button 
                onClick={() => { setActiveSection(AppSection.TASKS); handleUserInteraction(); }}
                className={`pb-3 text-sm font-medium transition-all duration-200 relative ${activeSection === AppSection.TASKS ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Tasks
                {activeSection === AppSection.TASKS && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full"></div>}
            </button>
            <button 
                onClick={() => { setActiveSection(AppSection.REMINDERS); handleUserInteraction(); }}
                className={`pb-3 text-sm font-medium transition-all duration-200 relative ${activeSection === AppSection.REMINDERS ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Reminders
                {activeSection === AppSection.REMINDERS && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full"></div>}
            </button>
            <button 
                onClick={() => { setActiveSection(AppSection.BIRTHDAYS); handleUserInteraction(); }}
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
             {permissionStatus !== 'granted' && (
                 <button onClick={requestNotificationPermission} className="mt-4 text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg">
                     Enable Notifications
                 </button>
             )}
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
            onFocus={handleUserInteraction}
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