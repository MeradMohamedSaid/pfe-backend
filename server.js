import express from "express";
import mysql from "mysql";
import cors from "cors";
import session from "express-session";
import MySQLStore from "express-mysql-session";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import { param } from "express-validator";

const app = express();
// Enable CORS with credentials
app.use(
  cors({
    origin: "http://localhost:4000", // Allow requests from this origin
    credentials: true, // Allow credentials (cookies | data including the userID)
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(
  express.urlencoded({
    extended: true,
  })
);

const con = mysql.createConnection({
  host: "localhost",
  port: "3306",
  user: "root",
  password: "",
  database: "pfe",
});

const PORT = process.env.PORT || 3000;

const MySQLStoreWithSession = MySQLStore(session);

// Now you can create a session store using the initialized MySQLStoreWithSession
const sessionStore = new MySQLStoreWithSession(
  {
    expiration: 10080000,
    createDatabaseTable: true,
    schema: {
      tableName: "sessiontbl",
      columnsNames: {
        session_id: "session_id",
        expires: "expires",
        data: "data",
      },
    },
  },
  con
);

// Then use sessionStore in your session middleware
app.use(
  session({
    secret: "rGK$#&9l@wqBcU3m",
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24h cookie age
      secure: false,
    },
  })
);

app.get("/", (req, res) => {
  res.send({ Message: "welcome to home page" });
});

//------------------------------------------[Checked]-----------------------------------------------------------------
// Get the users from database
app.get("/users", async (req, res) => {
  if (req.session.role !== 2 && req.session.role !== 1)
    return res.status(400).json({ Message: "only authorized for admins" });
  const query = "SELECT id,name,email,role,registertime FROM userinfo";
  con.query(query, async (err, result) => {
    if (err) return res.json({ Error: err });
    if (result.length === 0)
      return res.status(404).json({ Message: "no user registration" });

    let users = [];
    const case3query = "SELECT validated from clinic_info where id = ?";
    const case2query = "SELECT validated from donortable where id = ?";

    for (const user of result) {
      user.validated = false;
      switch (user.role) {
        case 1:
          user.validated = true;
          users.push(user);
          break;
        case 2:
          try {
            const [case2Result] = await queryAsync(con, case2query, [user.id]);
            user.validated = case2Result.validated === 1;
            users.push(user);
          } catch (error) {
            console.error(error);
          }
          break;
        case 3:
          try {
            const [case3Result] = await queryAsync(con, case3query, [user.id]);
            user.validated = case3Result.validated === 1;
            users.push(user);
          } catch (error) {
            console.error(error);
          }
          break;
        case 4:
          user.validated = true;
          users.push(user);
          break;
        default:
          break;
      }
    }
    return res.json(users);
  });
});

// Function to promisify query
function queryAsync(connection, query, params) {
  return new Promise((resolve, reject) => {
    connection.query(query, params, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

//-----------------------------------------[Checked]------------------------------------------------------------------
app.get("/users/:id", [param("id").isInt().notEmpty()], (req, res) => {
  // Check user role
  // if (req.session.role !== 4 && req.session.role !== 1) {
  //   return res.status(400).json({ Message: "Only authorized for admins" });
  // }

  // Validate parameters
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Get user from database
  const query = "SELECT * FROM userinfo WHERE id = ?";
  con.query(query, [req.params.id], (err, result) => {
    if (err) {
      return res.status(400).json({ Error: err });
    }
    return res.status(200).json({ Result: result[0] });
  });
});

//--------------------------------------------------[Checked]---------------------------------------------------------
// Sign up Route [API : http://localhost:3000/signup]
app.post(
  "/signup",
  [
    body("email").notEmpty().isEmail(),
    body("password").notEmpty().isString().isLength({ min: 8 }), // Assume password is a string
    body("name").notEmpty().isString(),
    body("phone").notEmpty().isMobilePhone(), // Assuming phone number validation
    body("gender").notEmpty().isIn(["h", "m"]), // Assuming gender is a string
    body("role").notEmpty().isInt(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { email, password, name, phone, gender, role } = req.body;
    try {
      // Check if the email already exists
      const emailExistsQuery =
        "SELECT COUNT(*) AS count FROM userinfo WHERE email = ?";
      con.query(emailExistsQuery, [email], (err, result) => {
        if (err) {
          console.error("Error checking email existence:", err);
          return res.status(500).json({
            message: "An error occurred while checking email existence.",
          });
        }

        const emailExists = result[0].count > 0;
        if (emailExists) {
          return res.status(400).json({ message: "Email already exists." });
        }

        // Generate a random userId
        const userId = Math.floor(Math.random() * 100000000);

        // Hash the password securely
        const hashedPassword = crypto
          .createHash("sha256")
          .update(password)
          .digest("hex");

        // Create a new user record in the database
        const query =
          "INSERT INTO userinfo (id, name, phone, sex, email, password, role) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const values = [
          userId,
          name,
          phone,
          gender,
          email,
          hashedPassword,
          role,
        ]; // Assuming gender is collected from the form

        con.query(query, values, (err, result) => {
          if (err) {
            console.error("Error signing up:", err);
            return res
              .status(500)
              .json({ message: "An error occurred while signing up." });
          }
          req.session.userId = userId;
          req.session.role = role;
          req.session.visited = true;
          console.log(req.session);
          return res.status(200).json(
            /*{ message: "User signed up successfully.", userId }*/ {
              session: req.session,
            }
          );
        });
      });
    } catch (error) {
      console.error("Error signing up:", error);
      res.status(500).json({ message: "An error occurred while signing up." });
    }
  }
);

// app.post(
//   "/signup",
//   [
//     body("email").notEmpty().isEmail(),
//     body("password").notEmpty().isString().isLength({ min: 8 }), // Assume password is a string
//     body("name").notEmpty().isString(),
//     body("phone").notEmpty().isMobilePhone(), // Assuming phone number validation
//     body("gender").notEmpty().isIn(["h", "m"]), // Assuming gender is a string
//     body("role").notEmpty().isInt(),
//   ],
//   (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(422).json({ errors: errors.array() });
//     }

//     const { email, password, name, phone, gender, role } = req.body;

//     try {
//       // Generate a random userId
//       const userId = Math.floor(Math.random() * 100000000);

//       // Hash the password securely
//       const hashedPassword = crypto
//         .createHash("sha256")
//         .update(password)
//         .digest("hex");

//       // Create a new user record in the database
//       const query =
//         "INSERT INTO userinfo (id, name, phone, sex, email, password, role) VALUES (?, ?, ?, ?, ?, ?, ?)";
//       const values = [userId, name, phone, gender, email, hashedPassword, role]; // Assuming gender is collected from the form

//       con.query(query, values, (err, result) => {
//         if (err) {
//           console.error("Error signing up:", err);
//           return res
//             .status(500)
//             .json({ message: "An error occurred while signing up." });
//         }
//         req.session.userId = userId;
//         req.session.role = role;
//         req.session.visited = true;
//         console.log(req.session);
//         return res
//           .status(200)
//           .json({ message: "User signed up successfully.", userId });
//       });
//     } catch (error) {
//       console.error("Error signing up:", error);
//       res.status(500).json({ message: "An error occurred while signing up." });
//     }
//   }
// );
//------------------------------------------------[Checked]-----------------------------------------------------------
// Login Route [API : http://localhost:3000/login]
app.post(
  "/login",
  [
    // Schema validation using express-validator
    body("email").notEmpty().isLength({ min: 13, max: 64 }).isEmail(),
    body("password").notEmpty().isLength({ min: 8, max: 255 }).isString(),
  ],
  (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    const query = "SELECT * FROM userinfo WHERE email = ? and password = ?";
    con.query(query, [email, hashedPassword], (err, result) => {
      if (err) {
        console.error("Error login:", err);
        return res
          .status(500)
          .json({ message: "An error occurred while logging in." });
      }
      if (result.length > 0) {
        req.session.userId = result[0].id;
        req.session.role = result[0].role; // Assuming you have a 'role' field in your database
        req.session.visited = true;
        req.session.success = true;
        req.session.message = "Login successful";

        console.log("User's role:", req.session.role); // Log the user's role
        console.log("Session:", req.session); // Log the session object

        // Return the user's role in the response
        return res.json({ Session: req.session });
      } else {
        return res.status(401).json({ Message: "Invalid credentials" });
      }
    });
  }
);
//-------------------------------------------------[UserInfo]----------------------------------------------------------

app.get("/userinfo", (req, res) => {
  if (!req.session.userId)
    return res.status(400).json({ Error: "Session not valid" });

  const userId = req.session.userId;

  const queryFirstData = "SELECT name, phone, sex FROM userinfo WHERE id = ?";
  const querySecondData =
    "SELECT bloodType, Relations, diseases FROM donortable WHERE id = ?";

  // Fetching data from the first table
  con.query(queryFirstData, [userId], (err, firstResults) => {
    if (err) {
      return res
        .status(500)
        .json({ Error: "Internal Server Error, Unable to get user info" });
    }

    // Fetching data from the second table
    con.query(querySecondData, [userId], (err, secondResults) => {
      if (err) {
        return res
          .status(500)
          .json({ Error: "Internal Server Error, Unable to get donor info" });
      }

      // Combining data from both tables into a single object
      const userData = {
        userInfo: firstResults[0],
        donorInfo: secondResults[0],
      };

      res.status(200).json(userData);
    });
  });
});

//-------------------------------------------------[ClinicInfo]----------------------------------------------------------

app.get("/clinicinfo", (req, res) => {
  if (!req.session.userId)
    return res.status(400).json({ Error: "Session not valid" });

  const userId = req.session.userId;
  const querySecondData = "SELECT name, address FROM clinic_info WHERE id = ?";

  con.query(querySecondData, [userId], (err, secondResults) => {
    if (err) {
      return res
        .status(500)
        .json({ Error: "Internal Server Error, Unable to get donor info" });
    }

    const userData = {
      clinicInfo: secondResults[0],
    };

    res.status(200).json(userData);
  });
});

//-------------------------------------------------[Checked]----------------------------------------------------------
// Dashboard Route [API : http://localhost:3000/dashboard]
app.get("/centreModeratorDashBoard", (req, res) => {
  console.log("Session in Dashboard:", req.session);
  console.log("Role in Dashboard:", req.session.role);
  if (req.session.role !== 2)
    return res.status(401).send("Only authorized for Admins");
  return res.status(200).send("Welcome Admin");
});
//-------------------------------------------------[Checked]----------------------------------------------------------
app.post(
  "/donorRequest",
  [
    body("bloodType").notEmpty().isLength({ max: 3, min: 1 }),
    body("Relations").notEmpty(),
    body("diseases").notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    console.log("User id : ", req.session.userId);

    // Proceed with the rest of the logic for donor request...
    const { bloodType, Relations, diseases } = req.body;
    // Insert the donor request with dynamic role
    const query =
      "INSERT INTO donortable (id, bloodType, Relations, diseases, validated,docs) VALUES (?, ?, ?, ?, ?,?)";
    const verifeid = 0; // Initial before validating
    const docs = 0;
    con.query(
      query,
      [req.session.userId, bloodType, Relations, diseases, verifeid, docs],
      (err, result) => {
        if (err) {
          console.error("Error occurred while inserting donor request:", err);
          return res.status(500).json({
            Message: "An error occurred while inserting donor request",
          });
        }
        return res
          .status(200)
          .json({ Message: "New Donor has been added (None Verfied)", result });
      }
    );
  }
);
//-------------------------------------------------[Checked]----------------------------------------------------------
app.post(
  "/receiverRequest",
  [body("clinicName").notEmpty(), body("clinicAddress").notEmpty()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    if (req.session.userId === undefined)
      return res.status(400).json({ Error: "Not authenticated" });
    console.log("User id : ", req.session.userId);

    const { clinicName, clinicAddress } = req.body;
    // Insert the donor request with dynamic role
    const query =
      "INSERT INTO clinic_info (id, name, address, validated,docs) VALUES (?, ?, ?, ?,?)";
    const verifeid = 0; // Initial before validating
    const docs = 0;

    con.query(
      query,
      [req.session.userId, clinicName, clinicAddress, verifeid, docs],
      (err, result) => {
        if (err) {
          console.error("Error occurred while inserting donor request:", err);
          return res.status(500).json({
            Message: "An error occurred while inserting donor request",
          });
        }
        return res.status(200).json({
          Message: "New Clinic has been added (None Verfied)",
          result,
        });
      }
    );
  }
);
//--------------------------------------------[Checked]--------------------------------------------------------------
app.patch(
  "/validate/:id",
  [
    // Schema validation using express-validator
    param("id").notEmpty().isInt(), // Assuming userId is required and should be an integer
  ],
  (req, res) => {
    if (req.session.role !== 2)
      return res.status(401).json({ Message: "Only admins are authorized" });

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { id } = req.params; // Corrected to use id from req.params

    // Query to fetch the role associated with the userId from the request table
    const selectQuery = "SELECT role FROM request WHERE idUser = ?";

    con.query(selectQuery, [id], (err, result) => {
      if (err) {
        console.error("Error occurred while fetching user role:", err);
        return res
          .status(500)
          .json({ Message: "An error occurred while fetching user role" });
      }

      if (result.length === 0) {
        return res
          .status(404)
          .json({ Message: "No role found for the specified user" });
      }

      const requestedRole = result[0].role;

      // Update the user's role in the userinfo table
      const updateQuery = "UPDATE userinfo SET role = ? WHERE id = ?";
      con.query(updateQuery, [requestedRole, id], (updateErr, updateResult) => {
        // Corrected to use id from req.params
        if (updateErr) {
          console.error("Error occurred while updating user role:", updateErr);
          return res
            .status(500)
            .json({ Message: "An error occurred while updating user role" });
        }

        if (requestedRole === 4) {
          // If the role is 4, update validate in clinic_info table
          const updateClinicQuery =
            "UPDATE clinic_info SET validated = 1 WHERE modID = ?";
          con.query(updateClinicQuery, [id], (clinicErr, clinicResult) => {
            if (clinicErr) {
              console.error(
                "Error occurred while updating clinic_info:",
                clinicErr
              );
              return res.status(500).json({
                Message: "An error occurred while updating clinic_info",
              });
            }
            return res.status(200).json({
              Message: "User role and clinic validation updated successfully",
            });
          });
        } else {
          return res
            .status(200)
            .json({ Message: "User role updated successfully" });
        }
      });
    });
  }
);
//--------------------------------------------[Checked]---------------------------------------------------------------
app.get("/getRequests", (req, res) => {
  if (req.session.role !== 2)
    return res.status(401).json({ Message: "Only admins are authorized" });
  const query = "SELECT * FROM request";

  con.query(query, (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    return res.status(200).json({ Message: result });
  });
});

//----------------------------------------[Checked]-------------------------------------------------------------------
// Select Manager API [http://localhost:3000/managers]
app.get("/getManagers", (req, res) => {
  if (req.session.role !== 1)
    return res
      .status(400)
      .json({ Message: "Only Crud authorized in this page" });

  const query = "SELECT * FROM userinfo WHERE role = 2"; // Select all managers
  con.query(query, (err, result) => {
    if (err)
      return res
        .status(401)
        .json({ Message: "Error occurs while selecting managers" });
    return res.status(200).json(result); // Send the result directly
  });
});

//--------------------------------------------[Checked]---------------------------------------------------------------
// Add Stroring centre API [http://localhost:3000/addClinic]
// app.post(
//   "/addStoringCentre",
//   [
//     // Schema validation using express-validator
//     body("address").notEmpty().isString(),
//     body("maxCapacite").notEmpty().isInt(),
//     body("centreModerator").notEmpty().isInt(),
//     // Ensure schedule is not empty
//     body("schedule").notEmpty(),
//     body("name").notEmpty(),
//   ],
//   (req, res) => {
//     // Check for validation errors
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(422).json({ errors: errors.array() });
//     }
//     // Crud role is 0
//     console.log("Role :", req.session.role);
//     // if (req.session.role !== 0)
//     //   return res.status(401).json({ Message: "Only crud are authorized" });

//     const { address, maxCapacite, centreModerator, schedule, name } = req.body;
//     const stroginCentreID = Math.floor(Math.random() * 100000000);
//     const query =
//       "INSERT INTO stroingcentre (id, name ,address, maxCapacite, centreModerator, weekSchedule) VALUES (?,?,?,?,?,?)";
//     const values = [
//       stroginCentreID,
//       name,
//       address,
//       maxCapacite,
//       centreModerator,
//       JSON.stringify(schedule),
//     ];

//     con.query(query, values, (err, result) => {
//       if (err) {
//         if (err.code === "ER_DUP_ENTRY") {
//           return res.status(400).json({
//             Message: "blood center with the same id already exists",
//             res: "exist",
//           });
//         } else {
//           return res.status(500).json({
//             Message: "Error occurs while adding the storing centre",
//             Error: err,
//             res: "failed",
//           });
//         }
//       }
//       return res.status(200).json({
//         Message: "BloodCenter was added successfully",
//         result: "success",
//       });
//     });
//   }
// );

app.post(
  "/addStoringCentre",
  [
    // Schema validation using express-validator
    body("address").notEmpty().isString(),
    body("maxCapacite").notEmpty().isInt(),
    body("managerMail").notEmpty().isEmail(),
    body("managerName").notEmpty().isString(),
    body("managerPassword").notEmpty(),
    body("sotringCentreNumber").notEmpty().isMobilePhone(),
    body("storingCentreName").notEmpty().isString(),
    body("schedule").notEmpty(),
  ],
  (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Crud only
    if (req.session.role !== 1) {
      return res
        .status(401)
        .json({ Message: "Only CRUD users are authorized" });
    }

    // manager information from the request body
    const { managerMail, managerName, managerPassword, sotringCentreNumber } =
      req.body;
    const hashedPassword = crypto
      .createHash("sha256")
      .update(managerPassword)
      .digest("hex");
    const managerID = Math.floor(Math.random() * 100000000);
    const Role = 4;

    // insert the manager's information
    const managerQuery =
      "INSERT INTO userinfo (id, name, phone, email, password, role) VALUES (?, ?, ?, ?, ?, ?)";
    con.query(
      managerQuery,
      [
        managerID,
        managerName,
        sotringCentreNumber,
        managerMail,
        hashedPassword,
        Role,
      ],
      (managerErr, managerRes) => {
        if (managerErr) {
          return res.status(400).json({ Error: managerErr });
        }
        // storing centre information from the request body
        const { address, maxCapacite, storingCentreName, schedule } = req.body;
        const storingCentreID = Math.floor(Math.random() * 100000000);

        // SQL query to insert the storing centre's information
        const storingCentreQuery =
          "INSERT INTO stroingcentre (id, name, address, maxCapacite, centreModerator, weekSchedule) VALUES (?, ?, ?, ?, ?, ?)";
        con.query(
          storingCentreQuery,
          [
            managerID,
            storingCentreName,
            address,
            maxCapacite,
            managerID,
            JSON.stringify(schedule),
          ],
          (scErr, scRes) => {
            if (scErr) {
              return res.status(400).json({ Error: scErr });
            }

            // Successfully added the storing centre and manager
            res.status(201).json({
              Message: "Storing centre and manager added successfully",
              storingCentreID,
              managerID,
            });
          }
        );
      }
    );
  }
);

//-------------------------------------------------[Checked]----------------------------------------------------------
app.get("/getstroingcentre", (req, res) => {
  // Get storage center data from the database

  const query = "SELECT * FROM stroingcentre";
  con.query(query, (err, result) => {
    if (err) {
      return res.status(500).json({ Error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ Message: "No storage centers found" });
    }
    const date = new Date();
    const dayOfWeek = date.getDay();
    result.forEach((center) => {
      center.weekSchedule = JSON.parse(center.weekSchedule);
      center.todaySchedule = center.weekSchedule[dayOfWeek];
    });

    return res.status(200).json({ Results: result });
  });
});

app.get("/getDashInfo", (req, res) => {
  // Queries
  const queries = [
    "SELECT COUNT(*) AS Valappo FROM appointement WHERE validation = 1",
    "SELECT COUNT(*) AS Donappo FROM appointement WHERE validation = 0",
    "SELECT COUNT(*) AS verifDonor FROM donortable WHERE validated = 0 AND docs = 2",
    "SELECT COUNT(*) AS validDonor FROM donortable WHERE validated = 1",
    "SELECT COUNT(*) AS verifClinic FROM clinic_info WHERE validated = 1",
    "SELECT COUNT(*) AS cencount FROM stroingcentre",
    "SELECT COUNT(*) AS clincount FROM clinic_info",
    "SELECT COUNT(*) AS allcount FROM userinfo",
    "SELECT COUNT(*) AS packetsCount FROM bloodpacket",
  ];

  // Results object
  const results = {};

  // Execute queries
  queries.forEach((query, index) => {
    con.query(query, (err, rows) => {
      if (err) {
        console.error("Error executing query:", err);
        res.status(500).send("Internal Server Error");
        return;
      }
      const key = Object.keys(rows[0])[0];
      results[key] = rows[0][key];
      if (Object.keys(results).length === queries.length) {
        // All queries have been executed
        res.json(results);
      }
    });
  });
});

app.get("/getstroingcentrecrud", (req, res) => {
  // Get storage center data from the database
  if (req.session.role !== 1) {
    return res.status(400).json({ Message: "Only CRUD is authenticated" });
  }
  if (req.session.userId === undefined)
    return res.status(400).json({ Error: "Not authenticated" });
  const query =
    "SELECT stroingcentre.*, userinfo.phone FROM stroingcentre JOIN userinfo ON stroingcentre.centreModerator = userinfo.id";
  con.query(query, (err, result) => {
    if (err) {
      return res.status(500).json({ Error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ Message: "No storage centers found" });
    }
    const date = new Date();
    const dayOfWeek = date.getDay();
    var storingCentres = [];
    result.forEach((storingCentre, index) => {
      storingCentre.weekSchedule = JSON.parse(storingCentre.weekSchedule);
      storingCentre.todaySchedule = storingCentre.weekSchedule[dayOfWeek];
      const queryBloodPackets =
        "SELECT COUNT(*) AS packetCount FROM bloodpacket WHERE storedIn = ?";
      con.query(
        queryBloodPackets,
        [storingCentre.id],
        (err, bloodPacketResult) => {
          if (err) {
            return res.status(500).json({ Error: err });
          }
          const bloodCount = bloodPacketResult[0].packetCount;

          storingCentre.bloodPacketCount = bloodCount;

          const queryAppointments =
            "SELECT COUNT(*) AS appointmentCount FROM appointement WHERE centerID = ?";
          con.query(
            queryAppointments,
            [storingCentre.id],
            (err, appointmentResult) => {
              if (err) {
                return res.status(500).json({ Error: err });
              }
              const appointmentCount = appointmentResult[0].appointmentCount;
              storingCentre.appointmentCount = appointmentCount;
              storingCentres.push(storingCentre);
              if (index === result.length - 1) {
                return res.status(200).json({ Results: storingCentres });
              }
            }
          );
        }
      );
    });
  });
});

app.get(
  "/getstroingcentreInfoForClinic/:stroginCentreID",
  [param("stroginCentreID").notEmpty().isInt()],
  (req, res) => {
    // Get storage center data from the database
    const { stroginCentreID } = req.params;

    const query = "SELECT * FROM stroingcentre WHERE id = ?";
    con.query(query, [stroginCentreID], (err, result) => {
      if (err) {
        return res.status(500).json({ Error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ Message: "No storage centers found" });
      }
      const date = new Date();
      const dayOfWeek = date.getDay();
      result[0].weekSchedule = JSON.parse(result[0].weekSchedule);
      result[0].todaySchedule = result[0].weekSchedule[dayOfWeek];
      for (var i = 0; i < 7; i++) {
        // add that here
      }
      return res.status(200).json({ Results: result[0] });
    });
  }
);

app.get(
  "/getstroingcentreInfo/:stroginCentreID",
  [param("stroginCentreID").notEmpty().isInt()],
  (req, res) => {
    const { stroginCentreID } = req.params;

    const query = "SELECT * FROM stroingcentre WHERE id = ?";
    con.query(query, [stroginCentreID], (err, result) => {
      if (err) {
        return res.status(500).json({ Error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ Message: "No storage centers found" });
      }

      const weekSchedule = JSON.parse(result[0].weekSchedule);

      const appointmentCountsQuery =
        "SELECT day, COUNT(*) AS count FROM appointement WHERE centerID = ? GROUP BY day";
      con.query(appointmentCountsQuery, [stroginCentreID], (err, counts) => {
        if (err) {
          return res.status(500).json({ Error: err });
        }

        const appointmentCounts = [];

        // Populate appointmentCounts with counts, including zero counts
        for (let day = 0; day < 7; day++) {
          const countObj = counts.find((item) => item.day === day);
          if (countObj) {
            appointmentCounts.push({ day: day + 1, count: countObj.count });
          } else {
            appointmentCounts.push({ day: day + 1, count: 0 });
          }
        }

        result[0].appointmentCounts = appointmentCounts;
        result[0].weekSchedule = weekSchedule;

        return res.status(200).json({ Results: result[0] });
      });
    });
  }
);

//-------------------------------------------------[Checked]----------------------------------------------------------

// History :: :
app.get("/clinicHistory", (req, res) => {
  // Authorization check
  const clinicID = req.session.userId;

  const query =
    "SELECT bloodPacketID, storingCentreID, transactionDate, id FROM transactions WHERE clinicID = ? AND Type = 'out'";
  con.query(query, [clinicID], (queryErr, queryRes) => {
    if (queryErr) return res.status(402).json({ Error: queryErr });

    if (queryRes.length === 0) {
      return res.status(200).json({
        Message: "No transactions found for this clinic",
        res: false,
        arr: [],
      });
    }

    const response = [];

    queryRes.forEach((row) => {
      const transactionId = row.id;
      const storingCentreId = row.storingCentreID;
      const bloodPacketId = row.bloodPacketID;
      const transactionTime = row.transactionDate;

      const storingCentreNameQuery =
        "SELECT name FROM stroingcentre WHERE id = ?";
      con.query(storingCentreNameQuery, [storingCentreId], (scErr, scRes) => {
        if (scErr) {
          console.error("Error retrieving storing centre name:", scErr);
          return res.status(402).json({ Error: scErr });
        }

        const storingCentreName = scRes[0].name;

        const bloodPacketSizeQuery =
          "SELECT packetSize FROM bloodpacket WHERE id = ?";
        con.query(bloodPacketSizeQuery, [bloodPacketId], (bpErr, bpRes) => {
          if (bpErr) {
            console.error("Error retrieving blood packet size:", bpErr);
            return res.status(402).json({ Error: bpErr });
          }

          const packetSize = bpRes[0].packetSize;
          const date = new Date(transactionTime);
          const day = String(date.getDate()).padStart(2, "0"); // Get day and pad with leading zero if needed
          const month = String(date.getMonth() + 1).padStart(2, "0"); // Get month (zero-based index) and pad with leading zero if needed
          const year = date.getFullYear(); // Get full year
          const formattedDate = `${day}/${month}/${year}`;
          const formattedTime = date.toLocaleTimeString();

          const transactionDetails = {
            id: transactionId,
            dateTime: formattedDate + " " + formattedTime,
            center: storingCentreName,
            capacity: packetSize,
            res: true,
          };

          response.push(transactionDetails);
          // Check if this is the last transaction
          if (response.length === queryRes.length) {
            return res.status(200).json({ arr: response, res: true });
          }
        });
      });
    });
  });
});

app.get("/getClinicHistory", (req, res) => {
  // Authorization check
  const clinicID = req.session.userId;
  const query =
    "SELECT r.*, s.name AS storingCentreName FROM request r JOIN stroingcentre s ON r.storingCentreID = s.id WHERE r.clinicID = ?";
  con.query(query, [clinicID], (queryErr, queryRes) => {
    if (queryErr) return res.status(402).json({ Error: queryErr });

    if (queryRes.length === 0) {
      return res.status(200).json({
        Message: "No transactions found for this clinic",
        res: false,
        arr: [],
      });
    }
    var output = [];
    queryRes.forEach((row) => {
      const transactionTime = row.creation_time;
      const date = new Date(transactionTime);
      const day = String(date.getDate()).padStart(2, "0"); // Get day and pad with leading zero if needed
      const month = String(date.getMonth() + 1).padStart(2, "0"); // Get month (zero-based index) and pad with leading zero if needed
      const year = date.getFullYear(); // Get full year
      const formattedDate = `${day}/${month}/${year}`;
      const formattedTime = date.toLocaleTimeString();
      const requestDetails = {
        id: row.idRequest,
        center: row.storingCentreName,
        dateTime: formattedDate + " " + formattedTime,
        status: row.status,
        res: true,
      };
      output.push(requestDetails);
      if (output.length === queryRes.length) {
        return res.status(200).json({ arr: output, res: true });
      }
    });
  });
});

app.get("/getDonorHistory", (req, res) => {
  const donorId = req.session.userId;

  // Check if the user role is either Donor (2) or CRUD (1)
  if (req.session.role !== 2 && req.session.role !== 1) {
    return res
      .status(400)
      .json({ Message: "Only Donors and CRUD users are authenticated" });
  }

  const query = `
    SELECT bloodpacket.id, bloodpacket.dt, bloodpacket.packetSize, stroingcentre.name AS centreName
    FROM bloodpacket
    JOIN stroingcentre ON bloodpacket.storedIn = stroingcentre.id
    WHERE bloodpacket.donorId = ?
  `;

  con.query(query, [donorId], (err, result) => {
    if (err) {
      return res.status(500).json({ Error: err });
    }

    // Map the query result to the desired format
    const resultats = result.map((row) => ({
      id: row.id,
      dateTime: row.dt,
      center: row.centreName,
      capacity: row.packetSize,
    }));

    return res
      .status(200)
      .json({ arr: resultats, res: true, len: resultats.length });
  });
});

app.post(
  "/addRequest",
  [
    body("storingCentreID").notEmpty().isNumeric(),
    body("PatientName").notEmpty().isString(),
    body("urgent").notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    if (req.session.role !== 3) {
      return res.status(403).json({ message: "Only clinic authorized" });
    }

    const { PatientName, urgent, storingCentreID } = req.body;
    const requestID = Math.floor(Math.random() * 100000000);
    const clinicID = req.session.userId;

    const query =
      "INSERT INTO request (idRequest, storingCentreID, clinicID, patientName, urgent) VALUES (?, ?, ?, ?, ?)";

    con.query(
      query,
      [requestID, storingCentreID, clinicID, PatientName, urgent],
      (insertErr, insertRes) => {
        if (insertErr) {
          return res.status(500).json({ error: insertErr });
        }

        return res.status(201).json({ done: true });
      }
    );
  }
);

app.delete(
  "/deleteStoringCentre/:stroginCentreID",
  [param("stroginCentreID").notEmpty().isInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    if (req.session.role !== 1)
      return res
        .status(401)
        .json({ Message: "Only CRUD operations are authorized" });

    const { stroginCentreID } = req.params;

    con.beginTransaction((err) => {
      if (err) return res.status(500).json({ Error: err });

      const deleteStroingCentreQuery = "DELETE FROM stroingcentre WHERE id = ?";
      con.query(deleteStroingCentreQuery, [stroginCentreID], (err, result) => {
        if (err) {
          return con.rollback(() => {
            res.status(400).json({ Error: err });
          });
        }

        const deleteUserInfoQuery = "DELETE FROM userinfo WHERE id = ?";
        con.query(deleteUserInfoQuery, [stroginCentreID], (err, result) => {
          if (err) {
            return con.rollback(() => {
              res.status(400).json({ Error: err });
            });
          }

          con.commit((err) => {
            if (err) {
              return con.rollback(() => {
                res.status(500).json({ Error: err });
              });
            }

            return res.status(200).json({
              Message:
                "Storing Centre and related user info were removed successfully",
              done: true,
            });
          });
        });
      });
    });
  }
);

//------------------------------------------------[Checked]-----------------------------------------------------------

app.patch(
  "/updateStoringCentre/:stroginCentreID",
  [
    // Schema validation using express-validator
    body("address").optional().isString(),
    body("maxCapacite").optional().isInt(),
    body("name").optional().isString(),
  ],
  (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Check user role
    if (req.session.role !== 1) {
      return res
        .status(401)
        .json({ Message: "Only CRUD users are authorized" });
    }

    const { stroginCentreID } = req.params;
    const { address, maxCapacite, name } = req.body;
    console.log("req body : ", req.body);

    // Construct the update query based on the provided fields
    let updateFields = [];
    let updateValues = [];
    if (address) {
      updateFields.push("address = ?");
      updateValues.push(address);
    }
    if (maxCapacite) {
      updateFields.push("maxCapacite = ?");
      updateValues.push(maxCapacite);
    }
    if (name) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }
    console.log("updateFields : ", updateFields);
    if (updateFields.length === 0) {
      return res.status(400).json({ Message: "No fields provided for update" });
    }

    updateValues.push(stroginCentreID); // Push stroginCentreID for WHERE clause

    // Construct and execute the update query
    const query = `UPDATE stroingcentre SET ${updateFields.join(
      ", "
    )} WHERE id = ?`;
    con.query(query, updateValues, (err, result) => {
      if (err)
        return res.status(400).json({
          Message: "Error occurred while updating the storing centre",
          err,
        });
      return res.status(200).json({
        Message: "Storing centre updated successfully",
        result,
        done: true,
      });
    });
  }
);

//----------------------------------------------[Get Role]-------------------------------------------------------------

app.get("/userRole", (req, res) => {
  // Check if user session exists
  if (!req.session.userId) {
    return res.status(200).json({ Role: -1 });
  }

  // Query to fetch user role from userinfo table
  const query = "SELECT role FROM userinfo WHERE id = ?";

  con.query(query, [req.session.userId], (err, result) => {
    if (err) {
      return res.status(400).json({ Error: err });
    }

    // Check if user exists
    if (result.length === 0) {
      return res
        .status(400)
        .json({ Error: "User id is not valid or does not exist" });
    }

    // Extract role from query result
    const role = result[0].role;

    return res.status(200).json({ Role: role });
  });
});

//----------------------------------------------[Get Stat]-------------------------------------------------------------

app.get("/userStat", (req, res) => {
  if (!req.session.userId)
    return res.status(400).json({ Error: "Invalid session" });

  const queryId = "SELECT role FROM userinfo WHERE id = ?";
  let queryRole; // Define queryRole variable here

  con.query(queryId, [req.session.userId], (err, result) => {
    if (err) {
      return res.status(400).json({ Error: err });
    }

    // Check if user exists
    if (result.length === 0) {
      return res
        .status(400)
        .json({ Error: "User id is not valid or does not exist" });
    }

    // Extract role from query result
    const role = result[0].role;

    // Use switch case to determine query based on role
    switch (role) {
      case 2:
        queryRole = "SELECT validated,docs FROM donortable WHERE id = ?";
        break;
      case 3:
        queryRole = "SELECT validated,docs FROM clinic_info WHERE id = ?";
        break;
      default:
        return res.status(400).json({ Error: "Invalid user role" });
    }

    con.query(queryRole, [req.session.userId], (err, result) => {
      if (err) {
        return res.status(400).json({ Error: err });
      }

      // Check if user exists
      if (result.length === 0) {
        return res
          .status(400)
          .json({ Error: "User id is not valid or does not exist" });
      }
      return res.status(200).json({
        role: role,
        Stat: result[0].validated,
        docs: result[0].docs,
        id: req.session.userId,
      });
    });
  });
});

//----------------------------------------------[Checked]-------------------------------------------------------------

//----------------------------------------------[Checked]-------------------------------------------------------------

app.post(
  "/addAppointement",
  [
    body("CenterId").notEmpty().isInt(),
    body("day").notEmpty().isInt(),
    body("period").notEmpty().isBoolean(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    if (!req.session.userId)
      return res.status(400).json({ Message: "Not authenticated" });

    const { CenterId, day, period } = req.body;
    const idAppointment = Math.floor(Math.random() * 100000000);
    const userID = req.session.userId;

    // Query to count appointments with the same period, centerID, and day
    const countQuery =
      "SELECT COUNT(*) AS count FROM appointement WHERE centerID = ? AND day = ? AND period = ? AND validation = ?";
    const countValues = [CenterId, day, period, 0];

    con.query(countQuery, countValues, (countErr, countResult) => {
      if (countErr) {
        return res.status(500).json({
          Message: "Error occurred while counting appointments",
          Error: countErr,
        });
      }

      const existingAppointmentsCount = countResult[0].count;

      // Check if the queueRank exceeds the maximum limit
      if (existingAppointmentsCount >= 25) {
        return res
          .status(400)
          .json({ Message: "The max level of appointments has been reached" });
      }

      // Calculate the queueRank
      const queueRank = existingAppointmentsCount + 1;
      const expectedTime = (queueRank - 1) * 600;
      // Insert the appointment into the database
      const insertQuery =
        "INSERT INTO appointement (appointmentID, centerID, userID, day, period, expectedTime, queueRank) VALUES (?, ?, ?, ?, ?, ?, ?)";
      const insertValues = [
        idAppointment,
        CenterId,
        userID,
        day,
        period,
        expectedTime,
        queueRank,
      ];

      con.query(insertQuery, insertValues, (insertErr, insertResult) => {
        if (insertErr) {
          if (insertErr.code === "ER_DUP_ENTRY") {
            return res.status(200).json({
              Message: "You already have an appointment scheduled",
              res: "exist",
            });
          } else {
            return res.status(500).json({
              Message: "Error occurred while adding appointment",
              Error: insertErr,
              res: "failed",
            });
          }
        }

        return res.status(200).json({
          Message: "Appointment scheduled successfully",
          res: "success",
        });
      });
    });
  }
);
//----------------------------------------------[Checked]-------------------------------------------------------------
app.post(
  "/addVerificationAppointment",
  [
    body("CenterId").notEmpty().isInt(),
    body("day").notEmpty().isInt(),
    body("period")
      .notEmpty()
      .isBoolean()
      .custom((value) => value === true || value === false), // Validate period to be either true (morning) or false (evening)
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    if (!req.session.userId) {
      return res.status(400).json({ Message: "Not authenticated" });
    }

    const { CenterId, day, period } = req.body;
    const idAppointment = Math.floor(Math.random() * 100000000);
    const userID = req.session.userId;

    const countQuery =
      "SELECT COUNT(*) AS count FROM appointement WHERE centerID = ? AND day = ? AND period = ? AND validation = ?";
    const countValues = [CenterId, day, period, 1];

    con.query(countQuery, countValues, (countErr, countResult) => {
      if (countErr) {
        return res.status(500).json({
          Message: "Error occurred while counting appointments",
          Error: countErr,
        });
      }

      const existingAppointmentsCount = countResult[0].count;

      if (existingAppointmentsCount >= 25) {
        return res
          .status(400)
          .json({ Message: "The max level of appointments has been reached" });
      }

      const queueRank = existingAppointmentsCount + 1;
      const expectedTime = (queueRank - 1) * 600;

      const insertQuery =
        "INSERT INTO appointement (appointmentID, centerID, userID, day, period, expectedTime, queueRank,validation) VALUES (?, ?, ?, ?, ?, ?, ?,?)";
      const insertValues = [
        idAppointment,
        CenterId,
        userID,
        day,
        period,
        expectedTime,
        queueRank,
        1,
      ];
      con.query(insertQuery, insertValues, (insertErr, insertResult) => {
        if (insertErr) {
          if (insertErr.code === "ER_DUP_ENTRY") {
            return res.status(200).json({
              Message: "You already have an appointment scheduled",
              res: "exist",
            });
          } else {
            return res.status(500).json({
              Message: "Error occurred while adding appointment",
              Error: insertErr,
              res: "failed",
            });
          }
        }

        // Update user docs based on their role
        const getRoleQuery = "SELECT role FROM userInfo WHERE id = ?";
        con.query(getRoleQuery, [req.session.userId], (roleErr, roleResult) => {
          if (roleErr)
            return res.status(400).json({
              Message: "Error occurred while fetching user role",
              Error: roleErr,
            });

          const role = roleResult[0]?.role;
          let updateDocsQuery = "";

          switch (role) {
            case 2:
              updateDocsQuery = "UPDATE donortable SET docs = 2 WHERE id = ?";
              break;
            case 3:
              updateDocsQuery = "UPDATE clinic_info SET docs = 2 WHERE id = ?";
              break;
            default:
              return res.status(400).json({ Message: "Invalid user role" });
          }

          con.query(
            updateDocsQuery,
            [req.session.userId],
            (updateDocErr, updateDocResult) => {
              if (updateDocErr)
                return res.status(500).json({
                  Message: "Error occurred while updating user docs",
                  Error: updateDocErr,
                });

              return res.status(200).json({
                Message: "Appointment scheduled successfully",
                res: "success",
              });
            }
          );
        });
      });
    });
  }
);
//----------------------------------------------[Checked]-------------------------------------------------------------
app.get("/getUserAppointments", (req, res) => {
  if (!req.session.userId)
    return res.status(400).json({ Message: "Not authenticated" });

  const userID = req.session.userId;

  const query =
    "SELECT a.*, s.name, s.address FROM appointement a JOIN stroingcentre s ON a.centerID = s.id WHERE a.userID = ?";
  con.query(query, [userID], (err, result) => {
    if (err) {
      return res.status(500).json({
        Message: "Error occurred while retrieving user appointments",
        Error: err,
      });
    }
    if (result.length === 0) {
      return res.status(200).json({
        res: false,
        Message: "No user appointments found",
        Appointments: [], // Returning an empty array if no appointments are found
      });
    } else {
      return res.status(200).json({
        res: true,
        Message: "User appointments retrieved successfully",
        Appointments: result[0], // Returning the actual result if appointments are found
      });
    }
  });
});

app.get(
  "/getCenterAppointments/:id",
  [param("id").isInt().notEmpty()],
  (req, res) => {
    if (req.session.role !== 1) {
      return res
        .status(400)
        .json({ Message: "Only CRUD authorized in this page" });
    }

    const centerID = req.params.id; // Extract centerID from URL parameters
    const query = "SELECT * FROM appointement WHERE centerID = ?";
    con.query(query, [centerID], (err, result) => {
      if (err) {
        return res.status(500).json({
          Message: "Error occurred while retrieving center appointments",
          Error: err,
        });
      }
      return res.status(200).json({
        valid: true,
        Appointments: result,
      });
    });
  }
);

app.get("/getCenterAppointments", (req, res) => {
  if (req.session.role !== 4) {
    return res
      .status(400)
      .json({ Message: "Only Storing Centers authorized in this page" });
  }
  if (!req.session.userId)
    return res.status(400).json({ Error: "Session not valid" });

  const centerID = req.session.userId; // Extract centerID from URL parameters
  const query =
    "SELECT * FROM appointement WHERE centerID = ? and validation = 0";
  con.query(query, [centerID], (err, result) => {
    if (err) {
      return res.status(500).json({
        Message: "Error occurred while retrieving center appointments",
        Error: err,
      });
    }
    return res.status(200).json({
      valid: true,
      Appointments: result,
    });
  });
});

//----------------------------------------------[Checked]-------------------------------------------------------------

app.delete(
  "/deleteappointment/:id",
  [param("id").isInt().notEmpty()],
  async (req, res) => {
    if (req.session.role !== 1 && req.session.role !== 4) {
      return res.status(400).json({
        Message: "Only CRUD or stroingCenters authorized in this page",
      });
    }
    const appointmentID = req.params.id;
    const query = "DELETE FROM appointement WHERE appointmentID = ?";
    con.query(query, [appointmentID], (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.status(200).json({ message: "Appointment deleted successfully" });
    });
  }
);

//----------------------------------------------[Checked]-------------------------------------------------------------
app.get(
  "/stroingcentre/:stroingcentreid",
  [param("stroingcentreid").isInt().notEmpty()],
  (req, res) => {
    // Validate parameters
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    if (req.session.role !== 1)
      return res.status(400).json({ Error: "Only curd is authorized" });

    // Get stroing centre data from database
    const query = "SELECT * FROM stroingcentre WHERE id = ?";
    con.query(query, [req.params.stroingcentreid], (err, result) => {
      if (err) {
        return res.status(404).json({ Error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ Message: "Stroing centre not found" });
      }
      return res.status(200).json({ Result: result });
    });
  }
);

//--------------------------------------------------[Checked]-------------------------------------------------------
app.get("/storingcentres", (req, res) => {
  const query = "SELECT * FROM stroingcentre";

  if (req.session.role !== 1)
    return res.status(400).json({ Error: "Only curd is authorized" });
  con.query(query, (err, result) => {
    if (err) {
      return res.status(404).json({ Error: err });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ Message: "no stroing centre were registred" });
    }
    return res.status(200).json({ Result: result });
  });
});
//-------------------------------------------[Checked]----------------------------------------------------------------

// blood packet API : [http://localhost:3000/bloodPacket]
app.post("/addBloodPacket", (req, res) => {
  if (req.session.role !== 2)
    return res.status(400).json({ Message: "only authorized for admins" });
  const { bloodType, expDate, packetSize, storedIn, donorId } = req.body;
  const idPacket = Math.floor(Math.random() * 100000000);
  const query =
    "INSERT INTO bloodpacket (id, bloodType, expDate, packetSize, storedIn, donorId) VALUES (?,?,?,?,?,?)";
  const values = [idPacket, bloodType, expDate, packetSize, storedIn, donorId];

  con.query(query, values, (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    return res
      .status(200)
      .json({ Message: "Blood packet added successfully", Result: result });
  });
});
//------------------------------------------------[Checked]-----------------------------------------------------------
app.get("/bloodPackets", (req, res) => {
  if (req.session.role !== 2)
    return res.status(400).json({ Message: "only admins are " });
  const query = "SELECT * FROM bloodpacket";
  con.query(query, (err, result) => {
    if (err) {
      return res.status(404).json({ Error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ Message: "no blood packet was registred" });
    }
    return res.status(200).json({ Message: result });
  });
});
//---------------------------------------------[Checked]------------------------------------------------------------
app.patch("/updateBloodPacket/:id", (req, res) => {
  if (req.session.role !== 2)
    return res.status(400).json({ Message: "Only authorized for admins" });

  const { bloodType, expDate, packetSize, storedIn, donorId } = req.body;
  const id = req.params.id;

  const query =
    "UPDATE bloodpacket SET bloodType=?, expDate=?, packetSize=?, storedIn=?, donorId=? WHERE id=?";
  const values = [bloodType, expDate, packetSize, storedIn, donorId, id];

  con.query(query, values, (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    return res
      .status(200)
      .json({ Message: "Blood packet updated successfully" });
  });
});

//----------------------------------------------[Checked]--------------------------------------------------------
app.get("/getBloodPacket/:id", (req, res) => {
  if (req.session.role !== 1)
    return res.status(400).json({ Message: "Only authorized for admins" });
  const id = req.params.id;
  const query = "SELECT * FROM bloodpacket WHERE storedIn = ?";
  con.query(query, [id], (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    if (result.length === 0) return res.status(200).json({ valid: false });
    console.log(result);
    return res.status(200).json({ Result: result, valid: true });
  });
});

//--------------------------------------------[Checked]---------------------------------------------------------------
app.get("/getDonors", (req, res) => {
  if (req.session.role !== 2)
    return res.status(401).json({ Message: "Only admins are authorized" });

  const query = "SELECT * FROM userinfo WHERE role = 3";
  con.query(query, (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    if (result.length === 0)
      return res.status(400).json({ Message: "No Donor were validate yet" });
    return res.status(200).json({ Result: result });
  });
});

app.get("/getDonorsCenter", (req, res) => {
  const query = "SELECT * FROM userinfo WHERE role = 2";
  con.query(query, (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    if (result.length === 0)
      return res.status(400).json({ Message: "No Donor were validate yet" });
    return res.status(200).json(result); // Return the array directly
  });
});

//-------------------------------------------[Checked]---------------------------------------------------------------
app.get("/getDonor/:id", param("id").isInt().notEmpty(), (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  if (req.session.role !== 2)
    return res.status(401).json({ Message: "Only admins are authorized" });
  const query = "SELECT * FROM userinfo WHERE id = ? AND role = 3";
  const { id } = req.params;

  con.query(query, [id], (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    return res.status(200).json({ Result: result });
  });
});

//----------------------------------------------[Checked]-----------------------------------------------
app.post(
  "/addClinic",
  [
    // Schema validation using express-validator
    body("clinicName").isString().notEmpty(),
    body("address").isString().notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Check if the user is authenticated
    if (!req.session.userId) {
      return res.status(400).json({ Message: "You're not authenticated" });
    }

    const query =
      "INSERT INTO clinic_info (id, name, address, validated, modID) VALUES (?,?,?,?,?)";
    const { clinicName, address } = req.body;
    const validate = 0; // Initialized
    const modID = req.session.userId; // Use userId from session

    const id = Math.floor(Math.random() * 10000000);

    con.query(
      query,
      [id, clinicName, address, validate, modID],
      (err, result) => {
        if (err) {
          return res.status(400).json({ Error: err });
        }
        return res.status(200).json({ Result: "Clinic added successfully" });
      }
    );
  }
);

//----------------------------------------[Checked]-----------------------------------------------------
app.get("/getClinics", (req, res) => {
  if (req.session.role !== 2)
    return res.status(401).json({ Message: "Only admins are authorized" });

  const query = "SELECT * FROM clinic_info";
  con.query(query, (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    return res.status(200).json({ Result: result });
  });
});
//--------------------------------------------[Checked]---------------------------------------------------
app.get("/getClinic/:id", (req, res) => {
  if (req.session.role !== 2)
    return res.status(401).json({ Message: "Only admins are authorized" });

  const query = "SELECT * FROM clinic_info WHERE id = ?";
  const { id } = req.params;
  con.query(query, [id], (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    return res.status(200).json({ Result: result });
  });
});

//------------------------------------------------[Checked]---------------------------------------------------------
app.post("/addTransaction", (req, res) => {
  if (req.session.role !== 2)
    return res.status(400).json({ Error: "Only admins are authorized" });

  const { bloodPacketID, storingCentreID, userId } = req.body;
  const idTransaction = Math.floor(Math.random() * 100000000);

  // Query to retrieve the role from the userinfo table
  const roleQuery = "SELECT role FROM userinfo WHERE id = ?";

  con.query(roleQuery, [userId], (err, result) => {
    if (err) return res.status(400).json({ Error: err });

    // Check if there is a result and get the role value
    const role = result[0].role;

    // Determine the type based on the role value
    let type;
    if (role === 4) {
      type = "out";
    } else if (role === 3) {
      type = "in";
    } else {
      return res.status(400).json({ Error: "Invalid role" });
    }

    // Final query to insert the transaction
    const transactionQuery =
      "INSERT INTO transactions (id, bloodPacketID, storingCentreID, clinicID, Type) VALUES (?, ?, ?, ?, ?)";
    const transactionValues = [
      idTransaction,
      bloodPacketID,
      storingCentreID,
      userId,
      type,
    ];

    con.query(transactionQuery, transactionValues, (err, result) => {
      if (err) return res.status(400).json({ Error: err });
      return res
        .status(200)
        .json({ Message: "Transaction added successfully", Result: result });
    });
  });
});

//--------------------------------------------------[Checked]-------------------------------------------------------------------------
app.get("/transactions", (req, res) => {
  if (req.session.role !== 2)
    return res.status(400).json({ Error: "Only admins are authorized" });

  const query = "SELECT * FROM transactions";

  con.query(query, (err, results) => {
    if (err) return res.status(400).json({ Error: err });
    return res.status(200).json({ Transactions: results });
  });
});

//---------------------------------------------------------------------------------------------------------------------------
app.get("/transactions/:id", (req, res) => {
  if (req.session.role !== 2)
    return res.status(400).json({ Error: "Only admins are authorized" });

  const transactionId = req.params.id;
  const query = "SELECT * FROM transactions WHERE id = ?";

  con.query(query, [transactionId], (err, result) => {
    if (err) return res.status(400).json({ Error: err });

    if (result.length === 0) {
      return res.status(404).json({ Message: "Transaction not found" });
    } else {
      return res.status(200).json({ Transaction: result[0] });
    }
  });
});

//----------------------------------------------------[Checked]-------------------------------------------------------------
// Logout route
app.post("/logout", (req, res) => {
  // Destroy the session to log the user out
  req.session.destroy((err) => {
    if (err) {
      // Handle error if session destruction fails
      return res
        .status(500)
        .json({ Error: "An error occurred while logging out" });
    }
    // Session destroyed successfully, send a response indicating successful logout
    return res.status(200).json({ Message: "Logout successful" });
  });
});

app.listen(PORT, () => {
  console.log(`Running on port :${PORT}`);
});

//--------------------------------------------- SAID ----------------------------------------------------

app.get("/storingCentreBloodPackets", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });

  const currentStoringCentre = req.session.userId;
  const query = `
    SELECT 
      bp.*,
      d.bloodType,
      u.name,
      u.phone,
      u.email
    FROM 
      bloodpacket bp
    JOIN 
      donortable d ON bp.donorId = d.id
    JOIN 
      userinfo u ON d.id = u.id
    WHERE 
      bp.storedIn = ?
  `;

  con.query(query, [currentStoringCentre], (err, result) => {
    if (err) return res.status(400).json({ Error: err });
    res.status(200).json(result);
  });
});

app.get("/appointmentsOnCenterDonors", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });

  const centerID = req.session.userId;

  const query = `
      (SELECT a.*, u.role, d.docs, d.validated, d.id,u.name,u.registertime
      FROM appointement a
      JOIN userinfo u ON a.userID = u.id
      JOIN donortable d ON u.id = d.id
      WHERE a.validation = 1 AND a.centerID = ? AND u.role = 2 AND d.validated = 0);`;

  con.query(query, [centerID], (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    res.json(results);
  });
});

app.get("/appointmentsOnCenterClinics", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });

  const centerID = req.session.userId;

  const query = `
  (SELECT a.*, u.role, c.docs, c.validated, c.id,c.name,u.registertime
  FROM appointement a
  JOIN userInfo u ON a.userID = u.id
  JOIN clinic_info c ON u.id = c.id
  WHERE a.validation = 1 AND a.centerID = ? AND u.role = 3 AND c.validated = 0);`;
  con.query(query, [centerID], (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    res.json(results);
  });
});

app.get("/donorApplication/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;

  const query = `
    SELECT 
      u.name, u.phone, u.sex,
      d.bloodType, d.Relations, d.diseases,d.docs
    FROM userinfo u
    LEFT JOIN donortable d ON u.id = d.id
    WHERE u.id = ?
  `;

  // Fetching data from both tables using a single query
  con.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({
        Error: "Internal Server Error, Unable to get user and donor info",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({ Error: "User not found" });
    }

    const userData = {
      name: results[0].name,
      phone: results[0].phone,
      sex: results[0].sex,
      bloodType: results[0].bloodType,
      Relations: results[0].Relations,
      diseases: results[0].diseases,
      docs: results[0].docs,
    };

    res.status(200).json(userData);
  });
});

app.get("/clinicApplication/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;

  const query = `
    SELECT name, address,docs FROM clinic_info WHERE id = ?
  `;

  // Fetching data from both tables using a single query
  con.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({
        Error: "Internal Server Error, Unable to get user and donor info",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({ Error: "User not found" });
    }

    const userData = {
      clinicname: results[0].name,
      clinicAddress: results[0].address,
      docs: results[0].docs,
    };

    res.status(200).json(userData);
  });
});

app.put("/validateDonorDocs/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;
  const query = "UPDATE donortable SET docs = 1 WHERE id = ?";
  con.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({
        Error: "Internal Server Error, Unable to update docs",
      });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ Error: "Donor not found" });
    }
    res.status(200).json({ message: "Docs updated successfully", suc: true });
  });
});

app.put("/validateClinicDocs/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;
  const query = "UPDATE clinic_info SET docs = 1 WHERE id = ?";
  con.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({
        Error: "Internal Server Error, Unable to update docs",
      });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ Error: "clinic not found" });
    }
    res.status(200).json({ message: "Docs updated successfully", suc: true });
  });
});

app.put("/validateAndDeleteDonor/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;
  con.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ Error: "Failed to start transaction" });
    }
    const updateQuery = "UPDATE donortable SET validated = 1 WHERE id = ?";
    const deleteQuery = "DELETE FROM appointement WHERE userID = ?";
    con.query(updateQuery, [userId], (err, result) => {
      if (err) {
        return con.rollback(() => {
          res.status(500).json({ Error: "Failed to update donor validation" });
        });
      }
      con.query(deleteQuery, [userId], (err, result) => {
        if (err) {
          return con.rollback(() => {
            res.status(500).json({ Error: "Failed to delete appointments" });
          });
        }
        con.commit((err) => {
          if (err) {
            return con.rollback(() => {
              res.status(500).json({ Error: "Failed to commit transaction" });
            });
          }
          res.status(200).json({
            message: "Donor validated and appointments deleted successfully",
            suc: true,
          });
        });
      });
    });
  });
});

app.put("/validateAndDeleteClinic/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;
  con.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ Error: "Failed to start transaction" });
    }
    const updateQuery = "UPDATE clinic_info SET validated = 1 WHERE id = ?";
    const deleteQuery = "DELETE FROM appointement WHERE userID = ?";
    con.query(updateQuery, [userId], (err, result) => {
      if (err) {
        return con.rollback(() => {
          res.status(500).json({ Error: "Failed to update donor validation" });
        });
      }
      con.query(deleteQuery, [userId], (err, result) => {
        if (err) {
          return con.rollback(() => {
            res.status(500).json({ Error: "Failed to delete appointments" });
          });
        }
        con.commit((err) => {
          if (err) {
            return con.rollback(() => {
              res.status(500).json({ Error: "Failed to commit transaction" });
            });
          }
          res.status(200).json({
            message: "Clinic validated and appointments deleted successfully",
            suc: true,
          });
        });
      });
    });
  });
});

app.put("/rejectAndDeleteDonor/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;
  con.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ Error: "Failed to start transaction" });
    }
    const updateQuery =
      "UPDATE donortable SET validated = 0, docs=0 WHERE id = ?";
    const deleteQuery = "DELETE FROM appointement WHERE userID = ?";
    con.query(updateQuery, [userId], (err, result) => {
      if (err) {
        return con.rollback(() => {
          res.status(500).json({ Error: "Failed to update donor validation" });
        });
      }
      con.query(deleteQuery, [userId], (err, result) => {
        if (err) {
          return con.rollback(() => {
            res.status(500).json({ Error: "Failed to delete appointments" });
          });
        }
        con.commit((err) => {
          if (err) {
            return con.rollback(() => {
              res.status(500).json({ Error: "Failed to commit transaction" });
            });
          }
          res.status(200).json({
            message: "Donor validated and appointments deleted successfully",
            suc: true,
          });
        });
      });
    });
  });
});

app.put("/rejectAndDeleteClinic/:id", (req, res) => {
  if (req.session.role !== 4)
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  const userId = req.params.id;
  con.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ Error: "Failed to start transaction" });
    }
    const updateQuery =
      "UPDATE clinic_info SET validated = 0, docs = 0 WHERE id = ?";
    const deleteQuery = "DELETE FROM appointement WHERE userID = ?";
    con.query(updateQuery, [userId], (err, result) => {
      if (err) {
        return con.rollback(() => {
          res.status(500).json({ Error: "Failed to update donor validation" });
        });
      }
      con.query(deleteQuery, [userId], (err, result) => {
        if (err) {
          return con.rollback(() => {
            res.status(500).json({ Error: "Failed to delete appointments" });
          });
        }
        con.commit((err) => {
          if (err) {
            return con.rollback(() => {
              res.status(500).json({ Error: "Failed to commit transaction" });
            });
          }
          res.status(200).json({
            message: "Clinic rejected and appointments deleted successfully",
            suc: true,
          });
        });
      });
    });
  });
});

app.post("/addPocket", (req, res) => {
  const { pocketsNumber, pocketSize, donorId } = req.body;
  const currentStoringCentre = req.session.userId;

  const today = new Date();
  const expDate = new Date();
  expDate.setDate(today.getDate() + 42);

  const dt = today.toISOString(); // ISO format for timestamp
  const expDateFormatted = expDate.toISOString().split("T")[0]; // Formatting to YYYY-MM-DD

  let query =
    "INSERT INTO bloodpacket (id, expDate, packetSize, storedIn, donorId, dt) VALUES ";
  let values = [];
  let queryValues = [];

  for (let i = 0; i < pocketsNumber; i++) {
    const pocketID = Math.floor(Math.random() * 100000000);
    values.push(
      pocketID,
      expDateFormatted,
      pocketSize,
      currentStoringCentre,
      donorId,
      dt
    );
    queryValues.push("(?, ?, ?, ?, ?, ?)");
  }

  query += queryValues.join(", ");

  con.query(query, values, (err, result) => {
    if (err) {
      return res.status(500).send("Database error: " + err.message);
    }
    res.status(200).send("Blood packets successfully added.");
  });
});

app.get("/storingCentreBloodPacketsCenter", (req, res) => {
  if (req.session.role !== 4) {
    return res
      .status(402)
      .json({ Error: "Only Storing Centre are authorized" });
  }

  const currentStoringCentre = req.session.userId;
  const query = `
    SELECT 
      bp.*,
      d.bloodType,
      u.name,
      u.phone,
      u.email,
      (SELECT COUNT(*) FROM bloodpacket bp2 WHERE bp2.storedIn = ? AND bp2.donorId = bp.donorId) as bloodTypeCount
    FROM 
      bloodpacket bp
    JOIN 
      donortable d ON bp.donorId = d.id
    JOIN 
      userinfo u ON d.id = u.id
    WHERE 
      bp.storedIn = ?
  `;

  con.query(
    query,
    [currentStoringCentre, currentStoringCentre],
    (err, result) => {
      if (err) {
        return res.status(400).json({ Error: err });
      }

      const bloodTypeCounts = {};
      result.forEach((packet) => {
        if (!bloodTypeCounts[packet.bloodType]) {
          bloodTypeCounts[packet.bloodType] = 0;
        }
        bloodTypeCounts[packet.bloodType]++;
      });

      res.status(200).json({
        bloodPackets: result,
        bloodTypeCounts: bloodTypeCounts,
      });
    }
  );
});

app.patch("/updateDonorInfo", (req, res) => {
  const { emailField, nameField, passwordField, newPassField, phoneField } =
    req.body;
  const currentID = req.session.userId;

  // Hash the current password (old password) using sha-2
  const oldPasswordHash = crypto
    .createHash("sha256")
    .update(passwordField)
    .digest("hex");

  // Query to get the current password hash for the donor
  con.query(
    "SELECT password FROM userinfo WHERE id = ?",
    [currentID],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Database query error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentPasswordHash = results[0].password;

      // Compare the hashed old password with the stored password
      if (oldPasswordHash !== currentPasswordHash) {
        return res
          .status(401)
          .json({ message: "Incorrect Confirmation password" });
      }

      // Initialize query and parameters
      let updateQuery = "UPDATE userinfo SET ";
      let updateParams = [];

      // Dynamically build the query based on non-empty fields
      if (emailField) {
        updateQuery += "email = ?, ";
        updateParams.push(emailField);
      }
      if (nameField) {
        updateQuery += "name = ?, ";
        updateParams.push(nameField);
      }
      if (newPassField) {
        const newPasswordHash = crypto
          .createHash("sha256")
          .update(newPassField)
          .digest("hex");
        updateQuery += "password = ?, ";
        updateParams.push(newPasswordHash);
      }
      if (phoneField) {
        updateQuery += "phone = ?, ";
        updateParams.push(phoneField);
      }

      // Remove the trailing comma and space
      updateQuery = updateQuery.slice(0, -2);
      updateQuery += " WHERE id = ?";
      updateParams.push(currentID);

      // Execute the update query
      con.query(updateQuery, updateParams, (err, updateResult) => {
        if (err) {
          return res.status(500).json({ message: "Error updating donor info" });
        }

        res.status(200).json({ message: "Donor info updated successfully" });
      });
    }
  );
});
