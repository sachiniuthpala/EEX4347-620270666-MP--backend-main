// routes/auth.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { auth, checkRole } = require("../middleware/auth");
const Course = require("../models/Course");

router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!["admin", "teacher", "student"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const user = new User({
      username,
      email,
      password,
      role,
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, "your_jwt_secret_key", {
      expiresIn: "24h",
    });

    res.status(201).json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const token = jwt.sign({ userId: user._id }, "your_jwt_secret_key", {
      expiresIn: "24h",
    });

    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin", auth, checkRole(["admin"]), async (req, res) => {
  try {
    const users = await User.find({}, "-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
router.get("/admin/:id", auth, checkRole(["admin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id, "-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
router.put("/admin/:id", auth, checkRole(["admin"]), async (req, res) => {
  try {
    const { username, email, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { username, email, role },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
router.delete("/admin/:id", auth, checkRole(["admin"]), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/teacher", auth, checkRole(["admin", "teacher"]), (req, res) => {
  res.json({ message: "Teacher access granted" });
});

router.get(
  "/student",
  auth,
  checkRole(["admin", "teacher", "student"]),
  (req, res) => {
    res.json({ message: "Student access granted" });
  }
);

// Create a new course
router.post(
  "/teacher/courses",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const { courseName, courseCode, description } = req.body;

      // Check if course code already exists
      const existingCourse = await Course.findOne({ courseCode });
      if (existingCourse) {
        return res.status(400).json({ error: "Course code already exists" });
      }

      const course = new Course({
        courseName,
        courseCode,
        description,
        teacher: req.user._id,
      });

      await course.save();
      res.status(201).json(course);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Get all courses for a teacher
router.get(
  "/teacher/courses",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const courses = await Course.find({ teacher: req.user._id })
        .populate("students", "username email")
        .sort({ createdAt: -1 });
      res.json(courses);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get specific course details
router.get(
  "/teacher/courses/:id",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const course = await Course.findOne({
        _id: req.params.id,
        teacher: req.user._id,
      }).populate("students", "username email");

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json(course);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update course details
router.put(
  "/teacher/courses/:id",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const { courseName, description, status } = req.body;
      const course = await Course.findOneAndUpdate(
        { _id: req.params.id, teacher: req.user._id },
        { courseName, description, status },
        { new: true, runValidators: true }
      );

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json(course);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Add students to course
router.post(
  "/teacher/courses/:id/students",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const { studentIds } = req.body;
      const course = await Course.findOne({
        _id: req.params.id,
        teacher: req.user._id,
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Verify all students exist and are actually students
      const students = await User.find({
        _id: { $in: studentIds },
        role: "student",
      });

      if (students.length !== studentIds.length) {
        return res.status(400).json({ error: "Invalid student IDs provided" });
      }

      // Add students without duplicates
      course.students = [...new Set([...course.students, ...studentIds])];
      await course.save();

      const updatedCourse = await Course.findById(course._id).populate(
        "students",
        "username email"
      );

      res.json(updatedCourse);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Remove student from course
router.delete(
  "/teacher/courses/:courseId/students/:studentId",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const course = await Course.findOne({
        _id: req.params.courseId,
        teacher: req.user._id,
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      course.students = course.students.filter(
        (student) => student.toString() !== req.params.studentId
      );

      await course.save();
      res.json({ message: "Student removed from course" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.post(
  "/teacher/courses/:courseId/zoom-links",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const { topic, link, date } = req.body;
      const course = await Course.findOne({
        _id: req.params.courseId,
        teacher: req.user._id,
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      course.zoomLinks.push({ topic, link, date });
      await course.save();

      res.status(201).json(course);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Delete zoom link
router.delete(
  "/teacher/courses/:courseId/zoom-links/:linkId",
  auth,
  checkRole(["teacher"]),
  async (req, res) => {
    try {
      const course = await Course.findOne({
        _id: req.params.courseId,
        teacher: req.user._id,
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      course.zoomLinks = course.zoomLinks.filter(
        (link) => link._id.toString() !== req.params.linkId
      );

      await course.save();
      res.json({ message: "Zoom link removed successfully" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Get all courses for a student
router.get(
  "/student/courses",
  auth,
  checkRole(["student"]),
  async (req, res) => {
    try {
      const courses = await Course.find({
        students: req.user._id,
      })
        .populate("teacher", "username email")
        .exec();

      res.json(courses);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get specific course details for student
router.get(
  "/student/courses/:courseId",
  auth,
  checkRole(["student"]),
  async (req, res) => {
    try {
      const course = await Course.findOne({
        _id: req.params.courseId,
        students: req.user._id,
      }).populate("teacher", "username email");

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json(course);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get available courses (courses where student is not enrolled)
router.get(
  "/student/available-courses",
  auth,
  checkRole(["student"]),
  async (req, res) => {
    try {
      const courses = await Course.find({
        students: { $ne: req.user._id },
        status: "active",
      })
        .populate("teacher", "username email")
        .exec();

      res.json(courses);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Enroll in a course
router.post(
  "/student/courses/:courseId/enroll",
  auth,
  checkRole(["student"]),
  async (req, res) => {
    try {
      const course = await Course.findById(req.params.courseId);

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      if (course.students.includes(req.user._id)) {
        return res
          .status(400)
          .json({ error: "Already enrolled in this course" });
      }

      course.students.push(req.user._id);
      await course.save();

      res.json({ message: "Successfully enrolled in course" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

module.exports = router;
