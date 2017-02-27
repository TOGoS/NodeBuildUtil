default:
	node build.js

%:
	node build.js ${MAKECMDGOALS}
