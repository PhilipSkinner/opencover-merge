const
	xml2js 		= require('xml2js'),
	fs 			= require('fs'),
	path 		= require('path'),
	argParser	= require('./lib/argParser')();

const loadFile = (file) => {
	const fullPath = path.join(process.env.PWD, file);
	console.log(`Loading XML file ${fullPath}`);

	return new Promise((resolve, reject) => {
		fs.readFile(fullPath, (err, data) => {
			if (err) {
				return reject(err);
			}

			xml2js.parseString(data.toString('utf8'), (err, result) => {
				if (err) {
					return reject(err);
				}

				return resolve(result);
			});
		});
	});
};

const writeFile = (file, content) => {
	const fullPath = path.join(process.env.PWD, file);
	console.log(`Outputting XML to ${fullPath}`);

	return new Promise((resolve, reject) => {
		fs.writeFile(fullPath, content, (err) => {
			if (err) {
				return reject(err);
			}

			return resolve();
		});
	});
};

const fileLookup = {};
let fileCount = 1;

const mergeFiles = (assembly, target, source) => {
	if (!fileLookup[assembly]) {
		fileLookup[assembly] = {};
	}

	source.forEach((file) => {
		let found = false;

		target.forEach((t) => {
			if (t['$'].fullPath === file['$'].fullPath) {
				found = true;
				fileLookup[assembly][file['$'].uid] = t['$'].uid;
			}
		});

		if (!found) {
			//change the file uid
			file['$'].uid = fileCount;
			fileCount++;

			target.push(file);
		}
	});
};

const mergeSequencePoints = (assembly, target, source) => {
	source.forEach((sequence) => {
		let found = false;

		target.forEach((existing) => {
			if (existing['$'].uspid === sequence['$'].uspid) {
				found = true;

				existing['$'].vc = parseInt(existing['$'].vc) + parseInt(sequence['$'].vc);
			}
		});

		if (!found) {
			target.push(sequence);
		}
	});

	//ensure we have good filerefs
	target.forEach((point) => {
		if (fileLookup[assembly][point['$'].fileid]) {
			point['$'].fileid = fileLookup[assembly][point['$'].fileid];
		}
	});
};

const mergeMethods = (assembly, target, source) => {
	source.forEach((method) => {
		let found = false;

		target.forEach((existing) => {
			if (existing.Name[0] === method.Name[0]) {
				found = true;

				mergeSequencePoints(assembly, existing.SequencePoints[0].SequencePoint, method.SequencePoints[0].SequencePoint);;
			}
		});

		if (!found) {
			target.push(method);
		}
	});

	//ensure we have good filerefs
	target.forEach((existing) => {
		if (fileLookup[assembly][existing.FileRef[0]['$'].uid]) {
			existing.FileRef[0]['$'].uid = fileLookup[assembly][existing.FileRef[0]['$'].uid];
		}
	});
};

const generateMethodStatistics = (data) => {

};

const mergeClasses = (assembly, target, source) => {
	source.forEach((cls) => {
		let found = false;

		target.forEach((existing) => {
			if (existing.FullName[0] === cls.FullName[0]) {
				found = true;

				mergeMethods(assembly, existing.Methods[0].Method, cls.Methods[0].Method);
				generateMethodStatistics(existing);
			}
		});

		if (!found) {
			target.push(cls);
		}
	});
};

const mergeModules = (target, source) => {
	source.forEach((module) => {
		let found = false;
		target.forEach((t) => {
			if (t.ModulePath[0] === module.ModulePath[0]) {
				found = true;

				mergeFiles(t.ModulePath[0], t.Files[0].File, module.Files[0].File);
				mergeClasses(t.ModulePath[0], t.Classes[0].Class, module.Classes[0].Class);
			}
		});

		if (!found) {
			target.push(module);
		}
	});
};

const mergeCoverage = (contents) => {
	const merged = {
		CoverageSession : {
			Summary : {},
			Modules : [
				{
					Module : []
				}
			]
		}
	};

	contents.forEach((c) => {
		mergeModules(merged.CoverageSession.Modules[0].Module, c.CoverageSession.Modules[0].Module);
	});

	return new Promise((resolve, reject) => {
		var builder = new xml2js.Builder();
		return resolve(builder.buildObject(merged));
	});
};

const args = argParser.fetch();

if (args.from && args.output) {
	console.log(`Merging ${args.from} into ${args.output}`);

	console.log(args.from);

	return Promise.all(args.from.map((file) => {
		return loadFile(file);
	})).then((contents) => {
		return mergeCoverage(contents);
	}).then((merged) => {
		return writeFile(args.output, merged);
	});
} else {
	console.log('Usage: opencover-merge --from=my.file.xml --from=another.file.xml --output=merged.xml');
}