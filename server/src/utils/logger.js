const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = levels[process.env.LOG_LEVEL] ?? levels.info;

function write(level, message, ...args) {
  if (levels[level] > currentLevel) return;
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (level === "error") {
    console.error(line, ...args);
  } else if (level === "warn") {
    console.warn(line, ...args);
  } else {
    console.log(line, ...args);
  }
}

export const logger = {
  error: (message, ...args) => write("error", message, ...args),
  warn: (message, ...args) => write("warn", message, ...args),
  info: (message, ...args) => write("info", message, ...args),
  debug: (message, ...args) => write("debug", message, ...args),
};

export default logger;
