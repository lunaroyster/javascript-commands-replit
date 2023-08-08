function Command({ data, commands, run }) {
  let cmd = {
    data,
  };

  if (commands && run) {
    throw new Error("Only one of `commands` or `run` must be defined");
  }

  if (commands) {
    cmd.data.type = "context";
    cmd.commands = async (...args) => {
      return replit.proxy(await commands(...args));
    };
  } else if (run) {
    cmd.data.type = "action";
    cmd.run = run;
  }

  return replit.proxy(cmd);
}

const cache = {}
async function getNpmPackages(search) {
  if (!cache[search]) {
    // fetch npm packages from the registry on the client side
    const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${search}`);

    console.log(res)
    const json = await res.json();
  
    cache[search] = json.objects;
  }

  return cache[search];
}

async function getPackageManagerName() {
  const [yarnRes, pnpmRes, bunRes] = await Promise.all(['yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'].map(f => replit.fs.readFile(f)));

  if (yarnRes.error !== 'NOT_FOUND') {
    return 'yarn'
  }
  if (pnpmRes.error !== 'NOT_FOUND') {
    return 'pnpm'
  }
  if (bunRes.error !== 'NOT_FOUND') {
    return 'bun'
  }

  return 'npm';
}

function installPackageCmd(packager, pkg) {
  if (packager === "npm") {
    return `npm i ${pkg}`;
  } else if (packager === "yarn") {
    return `yarn add ${pkg}`;
  } else if (packager === "bun") {
    return `bun install ${pkg}`;
  } else if (packager === "pnpm") {
    return `pnpm i ${pkg}`
  }
}

function uninstallPackageCmd(packager, pkg) {
  if (packager === "npm") {
    return `npm uninstall ${pkg}`;
  } else if (packager === "yarn") {
    return `yarn remove ${pkg}`;
  } else if (packager === "bun") {
    return `bun uninstall ${pkg}`;
  } else if (packager === "pnpm") {
    return `pnpm uninstall ${pkg}`
  }
}

async function main() {
  await replit.init();

  let parsedPackageJson = {};

  let packageJsonExistsRef = { current: false };

  let disposePackageWatch = null;

  const disposeRootFolderWatch = replit.fs.watchDir('.', {
    onChange: (e) => {
      if (e.find(file => file.path === "./package.json" && file.type === "FILE")) {
        packageJsonExistsRef.current = true
        beginWatchingPackageJson()
      } else {
        packageJsonExistsRef.current = false;
        if (disposePackageWatch) {
          disposePackageWatch();
          disposePackageWatch = null;
        }
      }
    }
  })

  function beginWatchingPackageJson() {
    disposePackageWatch = replit.fs.watchTextFile("package.json", {
      onReady: ({ initialContent }) => {
        parsedPackageJson = JSON.parse(initialContent);
      },
      onChange: ({ latestContent }) => {
        parsedPackageJson = JSON.parse(latestContent);
      },
      onError: (error) => {
        console.log(error);
        if (error.includes("no such file or directory")) {
          packageJsonExistsRef.current = false;
        }
      },
    });
  }

  let getPkgJson = () => parsedPackageJson;

  let cmd = Command({
    data: {
      id: "javascript-root-command",
      label: "JS",
      description: "Javascript commands",
      contributions: [
        "commandbar",
        // 'filetree-context-menu'
      ],
      icon: "icons/javascript.png",
    },
    commands: async (props) => {
      if (!props.active && !props.search) {
        return [];
      }

      if (!packageJsonExistsRef.current) {
        const packager = await getPackageManagerName();
        
        return [
          Command({
            data: {
              label: `${packager} init`,
              description: "initialize package.json in this repl",
              icon: "icons/npm.svg",
            },
            run: async () => {
              await replit.extensionPort.internal.execInShell(`${packager} init`)
            }
          })
        ]
      }
      
      return [
        Command({
          data: {
            label: "scripts",
            description: "run scripts in package.json",
            icon: "icons/npm.svg",
          },
          commands: async ({ active, search }) => {
            if (!packageJsonExistsRef.current) {
              return [
                // we have to filter for active state before adding this
                // Command({
                //   data: {
                //     label: "No package.json",
                //     description: "No package.json found",
                //     icon: "npm.svg",
                //   },
                //   run: async () => { }
                // })
              ];
            }

            return Object.entries(getPkgJson().scripts).map(([name, run]) =>
              Command({
                data: {
                  label: name,
                  description: run,
                  icon: "icons/npm.svg",
                },
                run: async () => {
                  const packager = await getPackageManagerName();
                  
                  await replit.extensionPort.internal.execInShell(
                    `${packager} run ${name}`,
                  );
                },
              }),
            );
          },
        }),
        Command({
          data: {
            label: "install",
            description: "install a package from the npm registry",
            icon: "icons/download.png"
          },
          commands: async ({active, search}) => {
            if (!active) {
              return []
            }

            const npmPkgs = await getNpmPackages(search);

            return npmPkgs.map(pkg => {
              return Command({
                data: {
                  label: pkg.package.name,
                  description: pkg.package.description,
                },
                run: async () => {
                  const packager = await getPackageManagerName();

                  
                  await replit.extensionPort.internal.execInShell(installPackageCmd(packager, pkg.package.name))
                }
              })
            })
          }
        }),
        Command({
          data: {
            label: "uninstall",
            description: "uninstall an installed package",
            icon: "icons/trash.png",
          },
          commands: async ({active}) => {
            if (!active) {
              return []
            }


            const depsObject = getPkgJson().dependencies;
            console.log(depsObject);

            return Object.entries(depsObject).map(([key, val]) => (
              Command({
                data: {
                  label: key,
                  description: val,
                  icon: "icons/trash.png",
                },
                run: async () => {
                  const packager = await getPackageManagerName();
                  
                  await replit.extensionPort.internal.execInShell(uninstallPackageCmd(packager, key))
                }
              })
            ))
          }
        })
      ];
    },
  });

  await replit.extensionPort.internal.commands.registerCommand(cmd);
}

main();
