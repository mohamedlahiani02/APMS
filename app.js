// Passenger/Plesk startup entry point; one HTTP listener serves both frameworks.
require("./ops/plesk/server.cjs").start();
