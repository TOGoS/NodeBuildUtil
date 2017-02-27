default:
	node build.js build

%:
	node build.js ${MAKECMDGOALS}
