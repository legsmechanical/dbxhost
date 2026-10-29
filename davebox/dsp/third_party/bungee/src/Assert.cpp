// Copyright (C) 2020-2026 Parabola Research Limited
// SPDX-License-Identifier: MPL-2.0

#include "Assert.h"

#if defined(__SSE2__) || defined(_M_X64)
#	include <immintrin.h>
#endif

#ifdef BUNGEE_PETRIFY
#	include <unistd.h>
#endif

#include <array>
#include <csignal>
#include <cstdio>
#include <cstdlib>

namespace Bungee::Assert {

#if BUNGEE_SELF_TEST

namespace {

int allowedFloatingPointExceptions(int userAllowed)
{
	int allowed = userAllowed;

#	if defined(__SSE2__) || defined(_M_X64)
	if (_MM_GET_DENORMALS_ZERO_MODE() == _MM_DENORMALS_ZERO_ON)
	{
		allowed |= FE_DENORMALOPERAND;
	}
	if (_MM_GET_FLUSH_ZERO_MODE() == _MM_FLUSH_ZERO_ON)
	{
		allowed |= FE_UNDERFLOW;
	}
#	endif

	return allowed;
}

} // namespace

#	ifndef BUNGEE_ASSERT_FAIL_EXTERNAL
void fail(int level, const char *message, const char *file, int line)
{
	fprintf(stderr, "Failed: BUNGEE_ASSERT%d(%s)  at (%s: %d)\n", level, message, file, line);
	std::abort();
}
#	endif

FloatingPointExceptions::FloatingPointExceptions(int userAllowed) :
	allowed(allowedFloatingPointExceptions(userAllowed))
{
	auto success = !std::fegetenv(&original);
	BUNGEE_ASSERT1(success);

	success = !std::feclearexcept(~allowed & FE_ALL_EXCEPT);
	BUNGEE_ASSERT1(success);

#	ifdef __GLIBC__
	fedisableexcept(FE_ALL_EXCEPT);
	feenableexcept(FE_ALL_EXCEPT & ~allowed);
#	endif
}

void FloatingPointExceptions::check() const
{
	BUNGEE_ASSERT1(!std::fetestexcept(~allowed & FE_INEXACT));
	BUNGEE_ASSERT1(!std::fetestexcept(~allowed & FE_UNDERFLOW));
	BUNGEE_ASSERT1(!std::fetestexcept(~allowed & FE_OVERFLOW));
	BUNGEE_ASSERT1(!std::fetestexcept(~allowed & FE_DIVBYZERO));
	BUNGEE_ASSERT1(!std::fetestexcept(~allowed & FE_INVALID));
}

FloatingPointExceptions::~FloatingPointExceptions()
{
	check();
	auto success = !std::fesetenv(&original);
	BUNGEE_ASSERT1(success);
}

#endif

#ifdef BUNGEE_PETRIFY

struct Petrification
{
	static void petrify(int sig, siginfo_t *info, void *context)
	{
		auto message = std::to_array("Bungee petrified PID=       \n");
		auto p = message.rbegin() + 1;
		int pid = (int)getpid();
		while (pid)
		{
			*p++ = '0' + pid % 10;
			pid /= 10;
		}
		write(STDERR_FILENO, message.data(), message.size());
		raise(SIGSTOP);
	}

	Petrification()
	{
		struct sigaction sa{};
		sa.sa_sigaction = petrify;
		sa.sa_flags = SA_SIGINFO;

		sigaction(SIGSEGV, &sa, nullptr);
		sigaction(SIGABRT, &sa, nullptr);
		sigaction(SIGILL, &sa, nullptr);
		sigaction(SIGFPE, &sa, nullptr);
	}
};

static Petrification petrification;

#endif

} // namespace Bungee::Assert
