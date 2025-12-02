import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Task, FilterType, SubTask } from './types';
import TaskItem from './components/TaskItem';
import { suggestCategory } from './services/geminiService';

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

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newTaskText = inputValue.trim();
    const tempId = crypto.randomUUID();
    
    // Optimistic UI update
    const newTask: Task = {
      id: tempId,
      text: newTaskText,
      completed: false,
      createdAt: Date.now(),
      subtasks: [],
      category: '...' 
    };

    setTasks(prev => [newTask, ...prev]);
    setInputValue('');
    setIsAdding(true);

    try {
        // Fetch AI category in background
        const categoryEmoji = await suggestCategory(newTaskText);
        setTasks(prev => prev.map(t => 
            t.id === tempId ? { ...t, category: categoryEmoji } : t
        ));
    } catch (error) {
        // Silently fail to default category
        setTasks(prev => prev.map(t => 
            t.id === tempId ? { ...t, category: '📝' } : t
        ));
    } finally {
        setIsAdding(false);
    }
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
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
      // Auto-complete parent if all subtasks are done (optional UX choice, keeping manual for now)
      return { ...task, subtasks: newSubtasks };
    }));
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
            placeholder="Add a new task..."
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