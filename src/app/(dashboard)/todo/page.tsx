"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, ListTodo, GripVertical, Clock, Calendar } from "lucide-react";
import { useTodos } from "@/features/todo/use-todos";

type FilterType = "all" | "active" | "completed";

export default function TodoPage() {
  const { todos, addTodo, toggleTodo, deleteTodo, clearCompleted } = useTodos();
  const [filter, setFilter] = useState<FilterType>("all");
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newDueDate, setNewDueDate] = useState("");

  function handleAdd() {
    if (!newText.trim()) return;
    addTodo(newText, newPriority, newDueDate || undefined);
    setNewText("");
    setNewDueDate("");
  }

  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  const priorityColors = {
    low: "border-l-green-400",
    medium: "border-l-yellow-400",
    high: "border-l-red-400",
  };

  const priorityLabels = {
    low: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    high: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          To-Do List
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep track of your assignments and tasks.
        </p>
      </div>

      {/* Add Task */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input
              placeholder="What do you need to do?"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="h-10 flex-1"
            />
            <Button onClick={handleAdd} disabled={!newText.trim()} className="h-10 px-4">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Priority:</Label>
              <div className="flex gap-1">
                {(["low", "medium", "high"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                      newPriority === p
                        ? priorityLabels[p]
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters & Stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                filter === f
                  ? "bg-card/30 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{activeCount} active</span>
          <span>{completedCount} done</span>
          {completedCount > 0 && (
            <button onClick={clearCompleted} className="text-destructive hover:underline">
              Clear done
            </button>
          )}
        </div>
      </div>

      {/* Todo List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 py-16">
          <ListTodo className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {filter === "all"
              ? "No tasks yet. Add one above!"
              : filter === "active"
              ? "All done! No active tasks."
              : "No completed tasks yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((todo) => (
            <div
              key={todo.id}
              className={`group flex items-center gap-3 rounded-xl border-l-[3px] bg-card/30 px-4 py-3 transition-all hover:shadow-sm ${
                priorityColors[todo.priority]
              } ${todo.completed ? "opacity-60" : ""}`}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/20" />
              <Checkbox
                checked={todo.completed}
                onCheckedChange={() => toggleTodo(todo.id)}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    todo.completed ? "line-through text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {todo.text}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${priorityLabels[todo.priority]}`}
                  >
                    {todo.priority}
                  </span>
                  {todo.dueDate && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(todo.dueDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={() => deleteTodo(todo.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
