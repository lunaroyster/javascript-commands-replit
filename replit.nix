{ pkgs }: {
  deps = [
    pkgs.yarn
    pkgs.nodePackages.vscode-langservers-extracted
    pkgs.nodePackages.typescript-language-server
  ];
}