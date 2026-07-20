SCHEDLY AI SCHEDULE EXTRACTION SYSTEM (PRODUCTION ARCHITECTURE)

We are redesigning the entire AI schedule extraction system for Schedly. The goal is to create a production-grade AI pipeline capable of extracting class schedules from almost any image format (camera photos, screenshots, PDFs, exported schedules, colored tables, merged cells, different university layouts).

The new architecture must prioritize accuracy, robustness, and structured data extraction over speed.

Objective

Create a complete AI pipeline that converts a schedule image into a fully interactive weekly timetable while minimizing extraction errors.

The AI should correctly identify:

Subject Name
Course Code
Day(s)
Start Time
End Time
Room
Instructor
Section
Block
Notes (if available)

The output must always be structured JSON ready to be inserted into the database.

AI Models
Vision Models (Image Understanding)

Primary

google/gemma-4-26b-a4b-it:free

Fallback 1

google/gemma-4-31b-it:free

Fallback 2

nvidia/nemotron-nano-12b-v2-vl:free

These models are responsible for understanding the schedule image itself.

Never use OCR text first if a vision model is available.

Reasoning & Validation Models

Primary

tencent/hy3:free

Fallback

nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free

Responsibilities:

Validate extracted data
Normalize time formats
Normalize day names
Detect duplicate classes
Correct OCR inconsistencies
Fill structured JSON
Reject impossible values
Development Models

Used only during development.

poolside/laguna-m.1:free
openai/gpt-oss-20b:free
New AI Pipeline
User Uploads Image

↓

Image Quality Analysis

↓

Automatic Image Enhancement

↓

Perspective Correction

↓

Shadow Removal

↓

Contrast Enhancement

↓

Noise Reduction

↓

High Resolution Processing

↓

Vision AI
(Gemma 4)

↓

Fallback Vision
(Gemma 4 31B)

↓

Fallback Vision
(Nemotron Nano VL)

↓

Structured Extraction

↓

Validation AI
(Tencent Hy3)

↓

Schedule Consistency Check

↓

Conflict Detection

↓

Confidence Score

↓

Interactive Preview

↓

User Confirmation

↓

Database
Image Preprocessing

Before any AI model receives the image, automatically perform:

Auto crop
Perspective correction
Rotate automatically
Remove shadows
Brightness normalization
Contrast enhancement
Image sharpening
Noise reduction
Resolution upscaling when necessary

The AI should always receive the cleanest possible image.

Vision Extraction Rules

The vision model must never simply perform OCR.

Instead, it must understand the schedule as a structured timetable.

The model should detect:

Table rows
Table columns
Days
Time slots
Merged cells
Subject blocks
Multiple subjects inside one cell
Color-coded schedules
Instructor information
Room information

The model must understand relationships between rows and columns rather than reading text line-by-line.

JSON Output

Always return structured JSON.

Example

{
  "semester": "1st Semester",
  "classes": [
    {
      "subject": "Programming 2",
      "courseCode": "CS102",
      "day": "Monday",
      "startTime": "07:30",
      "endTime": "09:00",
      "room": "Lab 301",
      "instructor": "Prof. Santos",
      "section": "BSCS-1A"
    }
  ]
}

Never return plain text.

Validation Layer

Tencent Hy3 validates every extracted class.

Checks include:

valid day
valid time format
duplicate subjects
duplicate schedule
impossible time
overlapping classes
missing fields
malformed course codes

Automatically normalize

Mon → Monday

TUE → Tuesday

7-9 → 07:00-09:00

Rm301 → Room 301

Confidence Score

Every extracted field must contain confidence.

Example

{
 "subject":"Programming",
 "confidence":0.99
}

Rules

confidence ≥ 0.95

Automatically accept.

confidence 0.80–0.94

Highlight for review.

confidence < 0.80

Require manual correction.

Interactive Review

Never save immediately.

Show the generated timetable first.

Allow users to edit:

subject
instructor
room
day
start time
end time

before saving.

Database Save

Only save after:

validation passes
confidence acceptable
user confirms
Error Recovery

If Vision AI fails:

Automatically switch

Gemma 26B

↓

Gemma 31B

↓

Nemotron Nano VL

↓

Retry

Never stop after one failed model.

Performance Goals

Target performance:

Detect multiple timetable layouts
Detect merged cells
Detect screenshots
Detect camera photos
Detect PDFs converted to images
Preserve exact spelling whenever possible
Produce editable structured JSON
Minimize hallucinations
Never invent missing information
Leave unknown fields blank instead of guessing
Final Goal

Build a production-ready AI schedule extraction system that behaves like a modern document intelligence pipeline—not a simple OCR reader. The system should combine image preprocessing, vision-based document understanding, structured extraction, validation, confidence scoring, and user review to maximize practical accuracy across a wide variety of real-world class schedule formats while remaining reliable and maintainable.