const fs = require("fs");
const path = require("path");
const https = require("http");

////////////////////////////////////////////////////////////////////////////////
// Constants

const PORT = 443;
const DATA_DIR_ENV_VAR = "SYNTH_MOD_BACKEND_DATA";
const FULLCHAIN_PATH_ENV_VAR = "SYNTH_MOD_BACKEND_FULLCHAIN";
const PRIVKEY_PATH_ENV_VAR = "SYNTH_MOD_BACKEND_PRIVKEY";

const DATA_DIR = process.env[DATA_DIR_ENV_VAR];
const FULLCHAIN_PATH = process.env[FULLCHAIN_PATH_ENV_VAR];
const PRIVKEY_PATH = process.env[PRIVKEY_PATH_ENV_VAR];

////////////////////////////////////////////////////////////////////////////////
// Helpers

// Loggers

function logInfo(content) {
  console.log("[INFO] " + content);
}

function logError(content) {
  console.log("[ERROR] " + content);
}

// HTTP

function respond(res, code, content) {
  res.writeHead(code, 
    { "Content-Type": "application/json",
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, accept',
      'access-control-max-age': 10 // Seconds.
    });

  if (content !== undefined) {
    res.end(JSON.stringify(content));
  } else {
    res.end();
  }

  if (code === 500) {
    logError(content);
  }
}

// Forms

function ensureContains(res, hay, hayName, needle) {
  if (!(needle in hay)) {
    respond(res, 400, `Missing ${hayName} '${needle}'`);
  }
}

// URLs

function parseUrl(url) {
  const [ route, paramString ] = url.split("?", 2);

  if (!paramString) {
    return {
      "route": route,
      "params": {}
    }
  }

  const params = {};
  for (const entry of paramString.split("&")) {
    const [ key, val ] = entry.split("=");
    params[key] = val ? val : null;
  }

  return {
    "route": route,
    "params": params
  }
}

////////////////////////////////////////////////////////////////////////////////
// Storage manager

function store(
  serverTimestamp,
  userID,
  body,
  callback
) {
  fs.readdir(DATA_DIR, (err, userDirs) => {
    if (err) {
      return callback({ code: 500, content: err });
    }

    //if (!userDirs.includes(userId)) {
    //  return callback({
    //    code: 400,
    //    content: `Forbidden user id '${userId}'`
    //  });
    //}

    fs.mkdir(`${DATA_DIR}`, { recursive: true }, err => {
      if (err) {
        return callback({ code: 500, content: err });
      }

      fs.writeFile(
        `${DATA_DIR}/`
          + `${serverTimestamp}-${userID}.json`,
        body,
        err => {
          if (err) {
            return callback({ code: 500, content: err });
          }
          logInfo(
            `Successfully stored data:\n`
              + `  at timestamp ${serverTimestamp}`
          );
          return callback(null);
          });
        }
      );
      // fs.copyFile(
      //   dataTarballTempPath,
      //   `${DATA_DIR}/${userId}/${projectId}/`
      //     + `${serverTimestamp}-${uniqueSuffix}.tar.gz`,
      //   err => {
      //     if (err) {
      //       return callback({ code: 500, content: err });
      //     }
      //     fs.unlink(dataTarballTempPath, err => {
      //       if (err) {
      //         return callback({ code: 500, content: err });
      //       }
      //       logInfo(
      //         `Successfully stored upload (and removed temp file) from:\n`
      //           + `          user ${userId}\n`
      //           + `       project ${projectId}\n`
      //           + `  at timestamp ${serverTimestamp}`
      //       );
      //       return callback(null);
      //     });
      //   }
      // );
    // });
  });
}

////////////////////////////////////////////////////////////////////////////////
// Checker

// Responses:
//   0 = error
//   1 = id recognized
//   2 = id not recognized
function check(res, id) {
  if (!id) {
    respond(res, 400, 0);
    return;
  }

  fs.readdir(DATA_DIR, (err, userDirs) => {
    if (err) {
      respond(res, 500, 0);
      return;
    }

    if (userDirs.includes(id)) {
      respond(res, 200, 1);
    } else {
      respond(res, 200, 2);
    }

  });
}

////////////////////////////////////////////////////////////////////////////////
// Handlers

function handlePost(req, res) {
  logInfo("posted");
  switch (req.url) {
    case "/upload":
      const serverTimestamp = new Date().getTime();

      // formidable().parse(req, (err, fields, files) => {
      //   if (err) {
      //     return respond(res, 400, "Error parsing form: " + err.toString());
      //   }

      //   ensureContains(res, fields, "field", "client_version");
      //   ensureContains(res, fields, "field", "client_timestamp");
      //   ensureContains(res, fields, "field", "user_info");
      //   ensureContains(res, fields, "field", "project_id");

      //   ensureContains(res, files, "file", "data_tarball");

      //   const userId = JSON.parse(fields["user_info"]).id;
      //   const projectId = fields["project_id"];
      //   const dataTarballPath = files["data_tarball"].path;

      let body = '';
      req.on('data', chunk => {
          body += chunk.toString(); // convert Buffer to string
      });
      req.on('end', () => {
          // DO STUFF WITH body VARIABLE HERE
          data = JSON.parse(body);
          userID = data['userID'];
          // etc
          // res.end('ok');
        store(serverTimestamp, userID, body, err => {
          if (err) {
            respond(res, err.code, err.content);
          } else {
            respond(res, 200);
          }
        });
      });
      // });

      break;

    default:
      respond(res, 404, `Unsupported POST URL '${req.url}'`);
      break;
  }
}

function handleGet(req, res) {
  const url = parseUrl(req.url);
  switch (url.route) {
    case "/check":
      check(res, url.params.id);
      break;

    default:
      respond(res, 404, `Unsupported GET URL '${req.url}'`);
      break;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Listener

function listener(req, res) {
  logInfo(`Received request: ${req.method} ${req.url}`);
  switch (req.method) {
    case "OPTIONS":
      respond(res, 200);
      break;

    case "POST":
      handlePost(req, res);
      break;

    case "GET":
      handleGet(req, res);
      break;

    default:
      respond(res, 404, `Unsupported request method '${req.method}'`);
      break;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Main

logInfo("--- Starting up Synthesis Modifiability backend server ---");

// Startup checks - environment variables

if (!DATA_DIR) {
  logError(`${DATA_DIR_ENV_VAR} environment variable not set`);
  process.exit(1);
}

if (!FULLCHAIN_PATH) {
  logError(`${FULLCHAIN_PATH_ENV_VAR} environment variable not set`);
  process.exit(1);
}

if (!PRIVKEY_PATH) {
  logError(`${PRIVKEY_PATH_ENV_VAR} environment variable not set`);
  process.exit(1);
}

// Startup checks - files exist

if (!fs.existsSync(DATA_DIR)) {
  logError(`Data directory '${DATA_DIR}' does not exist`);
  process.exit(1);
}

if (!fs.existsSync(FULLCHAIN_PATH)) {
  logError(`Fullchain path '${FULLCHAIN_PATH}' does not exist`);
  process.exit(1);
}

if (!fs.existsSync(PRIVKEY_PATH)) {
  logError(`Privkey path '${PRIVKEY_PATH}' does not exist`);
  process.exit(1);
}

// Server loop

const server = https.createServer(
  {
    key: fs.readFileSync(PRIVKEY_PATH),
    cert: fs.readFileSync(FULLCHAIN_PATH)
  },
 listener);

server.on("clientError", (err, socket) => {
  logError("client");
  logError(err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT);
logInfo(`Listening on port ${PORT}...`);
