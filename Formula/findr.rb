class Findr < Formula
  desc "Terminal UI meta-search client with plugin architecture"
  homepage "https://github.com/lucaArchidiacono/findr"
  version "0.1.0"
  license "GPL-3.0-only"

  on_macos do
    url "https://github.com/lucaArchidiacono/findr/releases/download/v0.1.0/findr-darwin-arm64.tar.gz"
    sha256 "7decc1453a1231dd0ec866156811ddb907cb6d9a61c4a20a5aea099d4ffface6"
  end

  on_linux do
    url "https://github.com/lucaArchidiacono/findr/releases/download/v0.1.0/findr-linux-x64.tar.gz"
    sha256 "9f67861890d5e2a4a81b09969baa9d4fa1713927ce7345291f5eeffdcc089163"
  end

  def install
    Dir.glob("findr-*").each do |f|
      bin.install f => "findr"
    end
  end

  test do
    assert_predicate bin/"findr", :executable?
  end
end
