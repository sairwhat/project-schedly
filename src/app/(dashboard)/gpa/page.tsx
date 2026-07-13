"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Calculator, RotateCcw } from "lucide-react";

type Course = {
  id: number;
  name: string;
  units: string;
  grade: string;
};

const GRADE_POINTS: Record<string, number> = {
  "4.0": 4.0,
  "3.5": 3.5,
  "3.0": 3.0,
  "2.5": 2.5,
  "2.0": 2.0,
  "1.5": 1.5,
  "1.0": 1.0,
  "5.0": 0,
  "INC": 0,
  "DRP": 0,
  "FA": 0,
};

const GRADE_OPTIONS = ["4.0", "3.5", "3.0", "2.5", "2.0", "1.5", "1.0", "INC", "DRP", "FA"];

let nextId = 1;

export default function GPACalculatorPage() {
  const [courses, setCourses] = useState<Course[]>([
    { id: nextId++, name: "", units: "3", grade: "4.0" },
    { id: nextId++, name: "", units: "3", grade: "4.0" },
    { id: nextId++, name: "", units: "3", grade: "4.0" },
  ]);
  const [targetGPA, setTargetGPA] = useState("");
  const [currentGPA, setCurrentGPA] = useState("");
  const [currentUnits, setCurrentUnits] = useState("");

  function addCourse() {
    setCourses((prev) => [...prev, { id: nextId++, name: "", units: "3", grade: "4.0" }]);
  }

  function removeCourse(id: number) {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCourse(id: number, field: keyof Course, value: string) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  function resetAll() {
    nextId = 1;
    setCourses([
      { id: nextId++, name: "", units: "3", grade: "4.0" },
      { id: nextId++, name: "", units: "3", grade: "4.0" },
      { id: nextId++, name: "", units: "3", grade: "4.0" },
    ]);
    setTargetGPA("");
    setCurrentGPA("");
    setCurrentUnits("");
  }

  const totalUnits = courses.reduce((sum, c) => sum + (parseFloat(c.units) || 0), 0);
  const totalGradePoints = courses.reduce(
    (sum, c) => sum + (parseFloat(c.units) || 0) * (GRADE_POINTS[c.grade] ?? 0),
    0
  );
  const gpa = totalUnits > 0 ? (totalGradePoints / totalUnits).toFixed(2) : "0.00";

  // Cumulative GPA
  const cumUnits = (parseFloat(currentUnits) || 0) + totalUnits;
  const cumGradePoints =
    (parseFloat(currentGPA) || 0) * (parseFloat(currentUnits) || 0) + totalGradePoints;
  const cumulativeGPA = cumUnits > 0 ? (cumGradePoints / cumUnits).toFixed(2) : "0.00";

  // Required grade calculation
  const target = parseFloat(targetGPA) || 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            GPA Calculator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compute your semester and cumulative GPA.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset
        </Button>
      </div>

      {/* Previous GPA */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Previous Semester (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prev-gpa" className="text-xs">Previous GPA</Label>
              <Input
                id="prev-gpa"
                type="number"
                step="0.01"
                min="0"
                max="4"
                placeholder="e.g. 3.5"
                value={currentGPA}
                onChange={(e) => setCurrentGPA(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prev-units" className="text-xs">Total Units Earned</Label>
              <Input
                id="prev-units"
                type="number"
                min="0"
                placeholder="e.g. 24"
                value={currentUnits}
                onChange={(e) => setCurrentUnits(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Course List */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            This Semester ({courses.length} courses)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addCourse} className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Course
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_100px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>Course Name</span>
            <span>Units</span>
            <span>Grade</span>
            <span />
          </div>

          {courses.map((course) => (
            <div
              key={course.id}
              className="grid grid-cols-[1fr_80px_100px_36px] gap-2 items-center"
            >
              <Input
                placeholder="e.g. Mathematics"
                value={course.name}
                onChange={(e) => updateCourse(course.id, "name", e.target.value)}
                className="h-9"
              />
              <Input
                type="number"
                min="0"
                step="0.5"
                value={course.units}
                onChange={(e) => updateCourse(course.id, "units", e.target.value)}
                className="h-9"
              />
              <select
                value={course.grade}
                onChange={(e) => updateCourse(course.id, "grade", e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => removeCourse(course.id)}
                disabled={courses.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Results */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/50 bg-primary/5">
          <CardContent className="flex flex-col items-center pt-6 pb-4">
            <Calculator className="mb-2 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">Semester GPA</p>
            <p className="text-3xl font-bold text-primary">{gpa}</p>
            <p className="text-xs text-muted-foreground">{totalUnits} units</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center pt-6 pb-4">
            <Calculator className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Cumulative GPA</p>
            <p className="text-3xl font-bold text-foreground">{cumulativeGPA}</p>
            <p className="text-xs text-muted-foreground">{cumUnits} total units</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="space-y-3 pt-6 pb-4">
            <p className="text-xs text-muted-foreground text-center">Target GPA</p>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="4"
              placeholder="e.g. 3.5"
              value={targetGPA}
              onChange={(e) => setTargetGPA(e.target.value)}
              className="h-9 text-center text-lg font-bold"
            />
            {target > 0 && parseFloat(currentGPA) > 0 && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Needed GPA this sem:</p>
                <p className="text-lg font-bold text-foreground">
                  {(() => {
                    const needed = (target * cumUnits - cumGradePoints + totalGradePoints) / totalUnits;
                    return needed > 4 ? "Not possible" : needed < 0 ? "Already achieved!" : needed.toFixed(2);
                  })()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
