"use client";

import { useState } from "react";
import type { ExtractedClass } from "@/features/upload/hooks/use-upload";
import type { ValidationIssue } from "@/server/services/validation.service";
import { saveSchedule, type SaveScheduleResult } from "@/app/(dashboard)/schedule/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Save, AlertCircle, ChevronDown, ChevronUp, AlertTriangle, XCircle } from "lucide-react";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

type Props = {
  classes: ExtractedClass[];
  uploadId?: string;
  fileUrl?: string;
  confidence?: number;
  validationIssues?: ValidationIssue[];
  onUpdate: (index: number, updated: ExtractedClass) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onSaved: (scheduleId: string) => void;
  onCancel: () => void;
};

export function ScheduleReview({
  classes, uploadId, confidence, validationIssues = [], onUpdate, onRemove, onAdd, onSaved, onCancel,
}: Props) {
  const [title, setTitle] = useState("");
  const [semester, setSemester] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError("Please enter a schedule title");
      return;
    }
    const validClasses = classes.filter((c) => c.subject.trim() && c.days.length > 0);
    if (validClasses.length === 0) {
      setSaveError("Please add at least one class with a subject and at least one day");
      return;
    }

    setSaving(true);
    setSaveError(null);

    const result: SaveScheduleResult = await saveSchedule({
      title: title.trim(),
      semester: semester.trim() || null,
      academicYear: academicYear.trim() || null,
      classes: validClasses,
      uploadId,
    });

    setSaving(false);

    if (result.success) {
      onSaved(result.scheduleId);
    } else {
      setSaveError(result.error);
    }
  };

  const toggleDay = (classIndex: number, day: string) => {
    const cls = classes[classIndex]!;
    const newDays = cls.days.includes(day as ExtractedClass["days"][number])
      ? cls.days.filter((d) => d !== day)
      : [...cls.days, day as ExtractedClass["days"][number]];
    onUpdate(classIndex, { ...cls, days: newDays });
  };

  const validCount = classes.filter((c) => c.subject.trim() && c.days.length > 0).length;

  return (
    <div className="space-y-4">
      {typeof confidence === "number" && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          confidence >= 0.8 ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" :
          confidence >= 0.5 ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" :
          "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        }`}>
          <span className="font-medium">AI Confidence: {Math.round(confidence * 100)}%</span>
          <span className="opacity-70">— Review and correct as needed</span>
        </div>
      )}

      {validationIssues.length > 0 && (
        <div className="space-y-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 dark:border-yellow-800 dark:bg-yellow-950">
          <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
            <AlertTriangle className="h-4 w-4" />
            Validation {validationIssues.filter((i) => i.severity === "error").length > 0 ? "Issues" : "Warnings"}
            <span className="text-xs font-normal opacity-70">({validationIssues.length})</span>
          </div>
          <ul className="space-y-1">
            {validationIssues.map((issue, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-300">
                {issue.severity === "error" ? (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                )}
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="schedule-title">Schedule Title *</Label>
        <Input
          id="schedule-title"
          placeholder="e.g., Fall 2026 Semester"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="semester">Semester</Label>
          <Input
            id="semester"
            placeholder="e.g., Fall"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year">Academic Year</Label>
          <Input
            id="year"
            placeholder="e.g., 2026-2027"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            Classes ({validCount}/{classes.length} valid)
          </h3>
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-3 w-3" /> Add Class
          </Button>
        </div>

        {classes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No classes extracted. Add one manually.
          </p>
        )}

        {classes.map((cls, i) => {
          const isExpanded = expandedIndex === i;
          const isValid = cls.subject.trim() && cls.days.length > 0;
          return (
            <Card key={i} className={`transition-colors ${!isValid ? "border-red-200 dark:border-red-800" : ""}`}>
              <CardHeader
                className="cursor-pointer py-3 px-4"
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {!isValid && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <CardTitle className="text-sm font-medium truncate">
                      {cls.subject || "Untitled Class"}
                    </CardTitle>
                    {cls.code && (
                      <Badge variant="secondary" className="shrink-0 text-xs">{cls.code}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {cls.days.map((d) => DAY_LABELS[d]).join(", ") || "No days"}
                    </Badge>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="px-4 pb-4 pt-0 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Subject *</Label>
                        <Input
                          value={cls.subject}
                          onChange={(e) => onUpdate(i, { ...cls, subject: e.target.value })}
                          placeholder="e.g., Calculus I"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Course Code</Label>
                        <Input
                          value={cls.code ?? ""}
                          onChange={(e) => onUpdate(i, { ...cls, code: e.target.value || null })}
                          placeholder="e.g., MATH 201"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Instructor</Label>
                        <Input
                          value={cls.instructor ?? ""}
                          onChange={(e) => onUpdate(i, { ...cls, instructor: e.target.value || null })}
                          placeholder="e.g., Dr. Smith"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Room</Label>
                        <Input
                          value={cls.room ?? ""}
                          onChange={(e) => onUpdate(i, { ...cls, room: e.target.value || null })}
                          placeholder="e.g., Room 301"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Section</Label>
                        <Input
                          value={cls.section ?? ""}
                          onChange={(e) => onUpdate(i, { ...cls, section: e.target.value || null })}
                          placeholder="e.g., A"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Block</Label>
                        <Input
                          value={cls.block ?? ""}
                          onChange={(e) => onUpdate(i, { ...cls, block: e.target.value || null })}
                          placeholder="e.g., BSCS-1A"
                        />
                      </div>
                    </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Start Time *</Label>
                      <Input
                        type="time"
                        value={cls.startTime}
                        onChange={(e) => onUpdate(i, { ...cls, startTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End Time *</Label>
                      <Input
                        type="time"
                        value={cls.endTime}
                        onChange={(e) => onUpdate(i, { ...cls, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Days *</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAYS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(i, day)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            cls.days.includes(day)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive mt-1"
                    onClick={() => onRemove(i)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Remove
                  </Button>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {saveError && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {saveError}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || classes.length === 0} className="flex-1">
          {saving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" /> Save Schedule</>
          )}
        </Button>
      </div>
    </div>
  );
}
