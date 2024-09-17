const childProcess = require('child_process');

const cp = childProcess.spawn('sf', ['-v']);

cp.on('close', code => {
	console.log(`isSfCliInstalled got close event, code is ${code}`);
	// If the exit code is 0, then SF or SFDX is present.
	// Otherwise, it's not.
});

cp.on('exit', code => {
	console.log(`isSfCliInstalled got exit event, code is ${code}`);
})

cp.on('error', err => {
	console.log(`isSfCliInstalled got error event, err is ${err.name}, ${err.message}`);
})
