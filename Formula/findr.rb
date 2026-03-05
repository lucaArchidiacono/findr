class Findr < Formula
  desc "Terminal UI meta-search client with plugin architecture"
  homepage "https://github.com/lucaArchidiacono/findr"
  version "0.1.1"
  license "GPL-3.0-only"

  on_macos do
    url "https://github.com/lucaArchidiacono/findr/releases/download/v0.1.1/findr-darwin-arm64.tar.gz"
    sha256 "49a26741f0ed7dadb685dc23a89b07cfdbc94752c6d2d0834318d994a58b1c7f"
  end

  on_linux do
    url "https://github.com/lucaArchidiacono/findr/releases/download/v0.1.1/findr-linux-x64.tar.gz"
    sha256 "793875fdedb99602abfa68043c2267fa76fc7eb4cab52b1a4c0e1941503393a0"
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
