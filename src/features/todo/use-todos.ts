"use client";

import { useState, useEffect, useCallback } from "react";

export type TodoItem = {
  id: string;
  text: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  createdAt: number;
  completedAt?: number;
};

const STORAGE_KEY = "schedly-todos";

export function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>([]);

  useEffect(() => {
    try {
      setTodos(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      setTodos([]);
    }
  }, []);

  const addTodo = useCallback(
    (text: string, priority: TodoItem["priority"], dueDate?: string) => {
      const todo: TodoItem = {
        id: crypto.randomUUID(),
        text: text.trim(),
        completed: false,
        priority,
        dueDate: dueDate || undefined,
        createdAt: Date.now(),
      };
      setTodos((prev) => {
        const next = [todo, ...prev];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) => {
      const next = prev.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: !t.completed,
              completedAt: !t.completed ? Date.now() : undefined,
            }
          : t
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => {
      const next = prev.filter((t) => t.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setTodos((prev) => {
      const next = prev.filter((t) => !t.completed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { todos, addTodo, toggleTodo, deleteTodo, clearCompleted };
}

export function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
